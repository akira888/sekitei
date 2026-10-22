// 操作のたびに scene をサーバーへ保存する。DOM と通信に依存しないよう、送る処理は外から受け取る。
// 送るのは同時に1件だけにし、送信中に変わった分は返事を待って最新だけを送る。
// 2件を同時に送ると、サーバーで古い方が後から書き込まれ、新しい内容を上書きすることがあるため

export type Send = (body: string) => Promise<void> // 保存できなければ reject する

export class Autosave {
  private readonly send: Send
  private readonly onResult: (saved: boolean) => void
  private pending?: string // まだ保存できていない最新の変更
  private sending = false

  constructor(send: Send, onResult: (saved: boolean) => void) {
    this.send = send
    this.onResult = onResult
  }

  save(body: string): void {
    this.pending = body
    void this.sendPending()
  }

  // ページを離れるときは返事を待てないので、送信中でも待たずに送る
  flush(): void {
    if (this.pending === undefined) return
    void this.send(this.pending).catch(() => {})
    this.pending = undefined
  }

  private async sendPending(): Promise<void> {
    if (this.sending || this.pending === undefined) return
    const body = this.pending
    this.pending = undefined
    this.sending = true
    try {
      await this.send(body)
    } catch {
      this.sending = false
      // 送信中に新しい変更がなければ失敗した内容を残し、次の変更かページを離れるときに送り直す。
      // すぐには送り直さない（つながらない間に送り続けないため）
      this.pending ??= body
      this.onResult(false)
      return
    }
    this.sending = false
    this.onResult(true)
    void this.sendPending()
  }
}
