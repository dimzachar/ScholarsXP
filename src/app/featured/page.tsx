import FeaturedBrowser from '@/components/FeaturedBrowser'

export const revalidate = 60

export default async function FeaturedPage() {
  return (
    <div className="container mx-auto max-w-7xl px-6 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Featured</h1>
        <div className="text-sm text-muted-foreground">Curated highlights from Scholars</div>
      </div>
      <FeaturedBrowser />
    </div>
  )
}
