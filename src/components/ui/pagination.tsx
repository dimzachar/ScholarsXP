'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { TOUCH_TARGET_CLASSES } from '@/lib/touch-targets'

export interface PaginationInfo {
  page: number
  limit: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface PaginationProps {
  pagination: PaginationInfo
  onPageChange: (page: number) => void
  onLimitChange?: (limit: number) => void
  showPageSizeSelector?: boolean
  pageSizeOptions?: number[]
  className?: string
  compact?: boolean
  loading?: boolean
}

export function Pagination({
  pagination,
  onPageChange,
  onLimitChange,
  showPageSizeSelector = false,
  pageSizeOptions = [10, 20, 50, 100],
  className,
  compact = false,
  loading = false
}: PaginationProps) {
  const { isMobile, isTablet } = useResponsiveLayout()

  // Treat tablets like mobile for pagination since they now use bottom navigation
  const isMobileOrTablet = isMobile || isTablet
  
  const {
    page,
    limit,
    totalCount,
    totalPages,
    hasNextPage,
    hasPrevPage
  } = pagination

  const startItem = ((page - 1) * limit) + 1
  const endItem = Math.min(page * limit, totalCount)

  // Generate page numbers to show
  const getPageNumbers = () => {
    const delta = isMobileOrTablet ? 1 : 2
    const range = []
    const rangeWithDots = []

    for (
      let i = Math.max(2, page - delta);
      i <= Math.min(totalPages - 1, page + delta);
      i++
    ) {
      range.push(i)
    }

    if (page - delta > 2) {
      rangeWithDots.push(1, '...')
    } else {
      rangeWithDots.push(1)
    }

    rangeWithDots.push(...range)

    if (page + delta < totalPages - 1) {
      rangeWithDots.push('...', totalPages)
    } else if (totalPages > 1) {
      rangeWithDots.push(totalPages)
    }

    return rangeWithDots
  }

  const pageNumbers = totalPages > 1 ? getPageNumbers() : []

  if (totalCount === 0) {
    return null
  }

  // Mobile/Tablet-specific wrapper for better visibility and accessibility
  const MobilePaginationWrapper = ({ children }: { children: React.ReactNode }) => {
    if (!isMobileOrTablet) return <>{children}</>

    return (
      <div className="bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg p-4 shadow-lg mb-16">
        {children}
      </div>
    )
  }

  return (
    <MobilePaginationWrapper>
      <div className={cn(
        "flex items-center justify-between gap-4",
        isMobileOrTablet ? "flex-col space-y-4" : "flex-row",
        className
      )}>
      {/* Results info */}
      <div className={cn(
        "text-sm text-muted-foreground",
        isMobileOrTablet ? "text-center order-first" : "text-left"
      )}>
        {compact || isMobileOrTablet ? (
          `${totalCount} results`
        ) : (
          `Showing ${startItem} to ${endItem} of ${totalCount} results`
        )}
      </div>

      {/* Page size selector */}
      {showPageSizeSelector && onLimitChange && !isMobileOrTablet && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show:</span>
          <Select
            value={limit.toString()}
            onValueChange={(value) => onLimitChange(parseInt(value))}
            disabled={loading}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Navigation controls */}
      <div className={cn(
        "flex items-center gap-2",
        isMobileOrTablet ? "order-2 w-full justify-center" : ""
      )}>
        {/* First page button (desktop only) */}
        {!isMobileOrTablet && !compact && totalPages > 5 && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.preventDefault()
              onPageChange(1)
            }}
            disabled={!hasPrevPage || loading}
            className="hidden sm:flex"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Previous button */}
        <Button
          variant="outline"
          size={isMobileOrTablet ? "default" : "sm"}
          onClick={(e) => {
            e.preventDefault()
            onPageChange(page - 1)
          }}
          disabled={!hasPrevPage || loading}
          className={cn(
            isMobileOrTablet ? TOUCH_TARGET_CLASSES.height.comfortable + " px-4" : ""
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          {!isMobileOrTablet && "Previous"}
        </Button>

        {/* Page numbers (desktop only) */}
        {!isMobileOrTablet && !compact && (
          <div className="flex items-center gap-1">
            {pageNumbers.map((pageNum, index) => (
              <React.Fragment key={index}>
                {pageNum === '...' ? (
                  <span className="px-2 text-muted-foreground">...</span>
                ) : (
                  <Button
                    variant={pageNum === page ? "default" : "outline"}
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault()
                      onPageChange(pageNum as number)
                    }}
                    disabled={loading}
                    className="w-10"
                  >
                    {pageNum}
                  </Button>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Current page indicator (mobile/tablet) */}
        {(isMobileOrTablet || compact) && (
          <div className={cn(
            "flex items-center justify-center px-3 py-2 text-sm font-medium text-muted-foreground bg-muted/50 rounded-md",
            isMobileOrTablet ? "min-w-[80px]" : ""
          )}>
            {page} / {totalPages}
          </div>
        )}

        {/* Next button */}
        <Button
          variant="outline"
          size={isMobileOrTablet ? "default" : "sm"}
          onClick={(e) => {
            e.preventDefault()
            onPageChange(page + 1)
          }}
          disabled={!hasNextPage || loading}
          className={cn(
            isMobileOrTablet ? TOUCH_TARGET_CLASSES.height.comfortable + " px-4" : ""
          )}
        >
          {!isMobileOrTablet && "Next"}
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Last page button (desktop only) */}
        {!isMobileOrTablet && !compact && totalPages > 5 && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.preventDefault()
              onPageChange(totalPages)
            }}
            disabled={!hasNextPage || loading}
            className="hidden sm:flex"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Page size selector (mobile/tablet) */}
      {showPageSizeSelector && onLimitChange && isMobileOrTablet && (
        <div className={cn(
          "flex items-center gap-2 justify-center",
          isMobileOrTablet ? "order-3 w-full" : ""
        )}>
          <span className="text-sm text-muted-foreground">Show:</span>
          <Select
            value={limit.toString()}
            onValueChange={(value) => onLimitChange(parseInt(value))}
            disabled={loading}
          >
            <SelectTrigger className={cn(
              "w-20",
              isMobileOrTablet ? TOUCH_TARGET_CLASSES.height.comfortable : ""
            )}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      </div>
    </MobilePaginationWrapper>
  )
}

export default Pagination
