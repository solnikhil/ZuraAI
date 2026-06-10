declare module 'discord-rpc' {
  export class Client {
    constructor(options: { transport: string })
    on(event: string, listener: (...args: any[]) => void): this
    login(options: { clientId: string }): Promise<void>
    setActivity(activity: Record<string, unknown>): Promise<void>
    clearActivity(): Promise<void>
    destroy(): Promise<void>
  }
}
