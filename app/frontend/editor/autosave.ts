// 操作のたびに scene をサーバーへ保存する。DOM と通信に依存しないよう、送る処理は外から受け取る。
// 送るのは同時に1件だけにし、送信中に変わった分は返事を待って最新だけを送る。
// 2件を同時に送ると、サーバーで古い方が後から書き込まれ、新しい内容を上書きすることがあるため

export type Send = (body: string) => Promise<void> // 保存できなければ reject する

export class Autosave {
  private readonly send: Send
  private readonly onResult: (saved: boolean) => void
  private pending?: string // まだ保存できていない最新の変更
  private sending = false
  private inFlight?: Promise<boolean> // 送信中の保存。終わると、保存できたかを返す

  constructor(send: Send, onResult: (saved: boolean) => void) {
    this.send = send
    this.onResult = onResult
  }

  save(body: string): void {
    this.pending = body
    this.sendPending()
  }

  // 送信中の保存と、残っている変更をすべて送り終えるまで待つ。保存に失敗して残っていた変更も送り直す。
  // 完成を送る前に使う（完成した後に古い保存が届くと、サーバーが断るため）。最後まで保存できたかを返す
  async settle(): Promise<boolean> {
    while (this.sending || this.pending !== undefined) {
      if (!this.sending) this.sendPending()
      if (!(await this.inFlight!)) return false
    }
    return true
  }

  // ページを離れるときは返事を待てないので、送信中でも待たずに送る
  flush(): void {
    if (this.pending === undefined) return
    void this.send(this.pending).catch(() => {})
    this.pending = undefined
  }

  private sendPending(): void {
    if (this.sending || this.pending === undefined) return
    const body = this.pending
    this.pending = undefined
    this.sending = true
    this.inFlight = this.send(body).then(
      () => {
        this.sending = false
        this.onResult(true)
        this.sendPending()
        return true
      },
      () => {
        this.sending = false
        // 送信中に新しい変更がなければ失敗した内容を残し、次の変更かページを離れるときに送り直す。
        // すぐには送り直さない（つながらない間に送り続けないため）
        this.pending ??= body
        this.onResult(false)
        return false
      },
    )
  }
}
