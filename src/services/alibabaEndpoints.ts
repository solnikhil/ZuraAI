export type AlibabaRegion = 'singapore' | 'us-virginia' | 'china-beijing'

export const DEFAULT_ALIBABA_REGION: AlibabaRegion = 'singapore'

export const ALIBABA_OPENAI_BASE_URLS: Readonly<Record<AlibabaRegion, string>> = Object.freeze({
  singapore: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  'us-virginia': 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
  'china-beijing': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
})

export function isAlibabaRegion(value: unknown): value is AlibabaRegion {
  return typeof value === 'string' && Object.hasOwn(ALIBABA_OPENAI_BASE_URLS, value)
}

export function getAlibabaBaseUrl(region: AlibabaRegion | undefined): string {
  return ALIBABA_OPENAI_BASE_URLS[region ?? DEFAULT_ALIBABA_REGION]
}
