export type LinkPreview = {
  title: string | null
  description: string | null
  image: string | null
  canonicalUrl: string
  siteName: string | null
  hostname: string
}

export type LinkPreviewLookupResult = {
  preview: LinkPreview | null
  unavailable: boolean
  resolved: boolean
}
