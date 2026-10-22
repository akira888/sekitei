import { describe, expect, it } from 'vitest'
import { Autosave } from './autosave'

// 届いたリクエストを溜めておき、返事（成功・失敗）はテストから返す偽のサーバー
function fakeServer() {
  const requests: { body: string; resolve(): void; reject(): void }[] = []
  const send = (body: string) => new Promise<void>((resolve, reject) => {
    requests.push({ body, resolve, reject: () => reject(new Error('保存に失敗')) })
  })
  // 返事を返し、それを受けた Autosave の続きの処理が終わるまで待つ
  const respond = async (index: number, ok: boolean) => {
    if (ok) requests[index].resolve()
    else requests[index].reject()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { send, respond, bodies: () => requests.map(({ body }) => body) }
}

function setup() {
  const server = fakeServer()
  const results: boolean[] = []
  const autosave = new Autosave(server.send, (saved) => results.push(saved))
  return { server, results, autosave }
}

describe('Autosave', () => {
  it('変更をすぐに送り、保存できたら知らせる', async () => {
    const { server, results, autosave } = setup()

    autosave.save('a')
    expect(server.bodies()).toEqual(['a'])

    await server.respond(0, true)
    expect(results).toEqual([true])
  })

  it('送信中の変更は、返事を待ってから最新だけを送る', async () => {
    const { server, autosave } = setup()

    autosave.save('a')
    autosave.save('b')
    autosave.save('c')
    expect(server.bodies()).toEqual(['a'])

    await server.respond(0, true)
    expect(server.bodies()).toEqual(['a', 'c'])
  })

  it('失敗したら知らせ、次の変更があるまで送り直さない', async () => {
    const { server, results, autosave } = setup()

    autosave.save('a')
    await server.respond(0, false)
    expect(results).toEqual([false])
    expect(server.bodies()).toEqual(['a'])

    autosave.save('b')
    expect(server.bodies()).toEqual(['a', 'b'])
  })

  describe('flush（ページを離れるとき）', () => {
    it('送信中でも待たずに、まだ送っていない最新の変更を送る', () => {
      const { server, autosave } = setup()

      autosave.save('a')
      autosave.save('b')
      autosave.flush()

      expect(server.bodies()).toEqual(['a', 'b'])
    })

    it('保存に失敗したままの変更を送り直す', async () => {
      const { server, autosave } = setup()

      autosave.save('a')
      await server.respond(0, false)
      autosave.flush()

      expect(server.bodies()).toEqual(['a', 'a'])
    })

    it('失敗した送信の間に新しい変更があれば、古い方ではなく新しい方を送る', async () => {
      const { server, autosave } = setup()

      autosave.save('a')
      autosave.save('b')
      await server.respond(0, false)
      autosave.flush()

      expect(server.bodies()).toEqual(['a', 'b'])
    })

    it('すべて保存できていれば何も送らない', async () => {
      const { server, autosave } = setup()

      autosave.save('a')
      await server.respond(0, true)
      autosave.flush()

      expect(server.bodies()).toEqual(['a'])
    })

    it('送った変更を、送信中の返事のあとで重ねて送らない', async () => {
      const { server, autosave } = setup()

      autosave.save('a')
      autosave.save('b')
      autosave.flush()
      await server.respond(0, true)

      expect(server.bodies()).toEqual(['a', 'b'])
    })
  })
})
