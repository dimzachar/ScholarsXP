import FeaturedBrowser from '@/components/FeaturedBrowser'
import { MobileLayout, MobileHeader } from '@/components/layout/MobileLayout'

export const revalidate = 60

export default async function FeaturedPage() {
  return (
    <MobileLayout>
      <MobileHeader
        title="Featured"
        subtitle="Curated highlights from Scholars"
      />
      <FeaturedBrowser />
    </MobileLayout>
  )
}
