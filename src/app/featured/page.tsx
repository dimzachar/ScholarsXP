import FeaturedBrowser from '@/components/FeaturedBrowser'
import { MobileLayout, MobileHeader } from '@/components/layout/MobileLayout'
import { getFeatured } from '@/lib/featured-service'
import type { ScoredFeatured } from '@/lib/featured-ranker'

export const revalidate = 60

export default async function FeaturedPage() {
  let initialItems: ScoredFeatured[] = []

  try {
    initialItems = await getFeatured('week', 24, {
      ranker: 'enhanced',
      authorBoost: true,
      autoTune: false,
    })
  } catch (error) {
    console.error('Featured page bootstrap failed', error)
  }

  return (
    <MobileLayout>
      <MobileHeader
        title="Featured"
        subtitle="Curated highlights from Scholars"
      />
      <FeaturedBrowser initialItems={initialItems} />
    </MobileLayout>
  )
}
