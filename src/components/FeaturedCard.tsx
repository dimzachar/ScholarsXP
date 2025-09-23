import React from 'react'

export default function FeaturedCard({
  url: _url, // kept for prop compatibility if needed later
  children,
}: {
  url: string
  children: React.ReactNode
}) {
  return (
    <article className="group mb-6 w-full break-inside-avoid rounded-2xl border bg-card/95 backdrop-blur-sm shadow-sm transition hover:shadow-lg hover:-translate-y-0.5 overflow-hidden">
      <div className="p-0 overflow-hidden w-full">{children}</div>
    </article>
  )
}
