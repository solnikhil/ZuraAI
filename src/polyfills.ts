export {}

type UrlParse = (url: string, base?: string | URL) => URL | null

declare global {
  interface URLConstructor {
    parse?: UrlParse
  }
}

if (typeof Promise.withResolvers === 'undefined') {
  const promiseConstructor = Promise as PromiseConstructor & {
    withResolvers: <T>() => PromiseWithResolvers<T>
  }

  promiseConstructor.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void

    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    return { promise, resolve, reject }
  }
}

if (typeof URL.parse === 'undefined') {
  URL.parse = function parse(url: string, base?: string | URL) {
    try {
      return new URL(url, base)
    } catch {
      return null
    }
  }
}
