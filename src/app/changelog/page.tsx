"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar, GitBranch, Plus, Edit, Bug, Trash2, Wrench, ChevronUp, Filter, Globe, Sparkles } from 'lucide-react'
import { staticChangelogData } from '@/lib/changelog'


const getChangeTypeConfig = (type: string) => {
  switch (type) {
    case 'added':
      return { icon: Plus, color: 'bg-success/10 text-success border-success/20', label: 'Added' }
    case 'changed':
      return { icon: Edit, color: 'bg-info/10 text-info border-info/20', label: 'Changed' }
    case 'fixed':
      return { icon: Bug, color: 'bg-warning/10 text-warning border-warning/20', label: 'Fixed' }
    case 'removed':
      return { icon: Trash2, color: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Removed' }
    case 'technical':
      return { icon: Wrench, color: 'bg-purple/10 text-purple border-purple/20', label: 'Technical' }
    default:
      return { icon: GitBranch, color: 'bg-muted text-muted-foreground', label: 'Other' }
  }
}

type ChangeType = 'added' | 'changed' | 'fixed' | 'removed' | 'technical'

interface FilterState {
  all: boolean
  added: boolean
  changed: boolean
  fixed: boolean
  technical: boolean
}

export default function ChangelogPage() {
  const [mounted, setMounted] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    all: true,
    added: false,
    changed: false,
    fixed: false,
    technical: false
  })

  useEffect(() => {
    setMounted(true)

    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 200)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!mounted) {
    return null
  }

  // Filter changelog data based on selected filters
  const filteredData = filters.all
    ? staticChangelogData
    : staticChangelogData.filter(entry => {
        const hasMatchingChanges = Object.entries(entry.changes).some(([changeType, changes]) => {
          if (!changes || changes.length === 0) return false
          return filters[changeType as ChangeType]
        })
        return hasMatchingChanges
      })

  // Apply show more/less logic
  const displayedData = showAll ? filteredData : filteredData.slice(0, 3)
  const hasMoreToShow = filteredData.length > 3

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFilterChange = (filterType: keyof FilterState) => {
    if (filterType === 'all') {
      setFilters({
        all: true,
        added: false,
        changed: false,
        fixed: false,
        technical: false
      })
    } else {
      setFilters(prev => {
        const newFilters = { ...prev, [filterType]: !prev[filterType] }
        const hasAnySelected = Object.entries(newFilters)
          .filter(([key]) => key !== 'all')
          .some(([, value]) => value)

        return {
          ...newFilters,
          all: !hasAnySelected
        }
      })
    }
  }

  const clearAllFilters = () => {
    setFilters({
      all: true,
      added: false,
      changed: false,
      fixed: false,
      technical: false
    })
  }

  const applyFilters = () => {
    setIsFilterOpen(false)
  }

  const getActiveFilterCount = () => {
    return Object.entries(filters)
      .filter(([key, value]) => key !== 'all' && value)
      .length
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-muted/50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <GitBranch className="h-4 w-4" />
            <span>Platform Updates</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Changelog
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Track the evolution of Scholars XP with detailed release notes and feature updates
          </p>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={filters.all ? "default" : "outline"}
              onClick={() => handleFilterChange('all')}
              className="flex items-center gap-2 px-4 py-2 transition-all duration-200 hover:scale-105"
              aria-pressed={filters.all}
              aria-label="Show all changelog entries"
            >
              <Globe className="h-4 w-4" />
              <span>ALL</span>
            </Button>
            <Button
              variant={filters.added ? "default" : "outline"}
              onClick={() => handleFilterChange('added')}
              className="flex items-center gap-2 px-4 py-2 transition-all duration-200 hover:scale-105"
              aria-pressed={filters.added}
              aria-label="Filter by new features and additions"
            >
              <Sparkles className="h-4 w-4" />
              <span>NEW FEATURES</span>
            </Button>
            <Button
              variant={filters.changed ? "default" : "outline"}
              onClick={() => handleFilterChange('changed')}
              className="flex items-center gap-2 px-4 py-2 transition-all duration-200 hover:scale-105"
              aria-pressed={filters.changed}
              aria-label="Filter by improvements and changes"
            >
              <Edit className="h-4 w-4" />
              <span>IMPROVEMENTS</span>
            </Button>
            <Button
              variant={filters.fixed ? "default" : "outline"}
              onClick={() => handleFilterChange('fixed')}
              className="flex items-center gap-2 px-4 py-2 transition-all duration-200 hover:scale-105"
              aria-pressed={filters.fixed}
              aria-label="Filter by bug fixes"
            >
              <Bug className="h-4 w-4" />
              <span>BUG FIXES</span>
            </Button>
          </div>

          <div className="flex items-center gap-4">
            {!filters.all && (
              <div className="text-sm text-muted-foreground">
                Showing {filteredData.length} of {staticChangelogData.length} versions
              </div>
            )}
          </div>
        </div>

        {/* Separator */}
        <Separator className="mb-6" />

        {/* Advanced Filter Interface */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Advanced Filters
                  {getActiveFilterCount() > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                      {getActiveFilterCount()}
                    </Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Advanced Filters</DialogTitle>
                  <DialogDescription>
                    Select which types of changes to display in the changelog.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-3">Change Types</h4>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="all"
                          checked={filters.all}
                          onCheckedChange={() => handleFilterChange('all')}
                        />
                        <label htmlFor="all" className="text-sm font-medium">All</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="added"
                          checked={filters.added}
                          onCheckedChange={() => handleFilterChange('added')}
                        />
                        <label htmlFor="added" className="text-sm">New Features</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="changed"
                          checked={filters.changed}
                          onCheckedChange={() => handleFilterChange('changed')}
                        />
                        <label htmlFor="changed" className="text-sm">Improvements</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="fixed"
                          checked={filters.fixed}
                          onCheckedChange={() => handleFilterChange('fixed')}
                        />
                        <label htmlFor="fixed" className="text-sm">Bug Fixes</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="technical"
                          checked={filters.technical}
                          onCheckedChange={() => handleFilterChange('technical')}
                        />
                        <label htmlFor="technical" className="text-sm">Technical</label>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={clearAllFilters}>
                      Clear All
                    </Button>
                    <Button onClick={applyFilters}>
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border"></div>

          <div className="space-y-12">
            {displayedData.map((entry) => (
            <div
              key={entry.version}
              className="relative transition-all duration-300 ease-in-out"
              style={{
                opacity: 1,
                transform: 'translateY(0)',
              }}
            >
              {/* Timeline dot */}
              <div className="absolute left-6 w-4 h-4 rounded-full border-2 bg-background border-border"></div>
              
              {/* Content */}
              <div className="ml-16">
                <Card className="shadow-lg hover:shadow-xl transition-shadow duration-200">
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-2xl">
                          Version {entry.version}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span className="text-sm font-medium">{entry.date}</span>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-6">
                    {Object.entries(entry.changes).map(([changeType, changes]) => {
                      if (!changes || changes.length === 0) return null
                      
                      const config = getChangeTypeConfig(changeType)
                      const Icon = config.icon
                      
                      return (
                        <div key={changeType}>
                          <div className="flex items-center gap-2 mb-3">
                            <Badge variant="outline" className={`${config.color} font-medium`}>
                              <Icon className="h-3 w-3 mr-1" />
                              {config.label}
                            </Badge>
                          </div>
                          
                          <ul className="space-y-2 ml-4">
                            {changes.map((change, changeIndex) => (
                              <li key={changeIndex} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-2 flex-shrink-0"></div>
                                <span>{change}</span>
                              </li>
                            ))}
                          </ul>
                          
                          {changeType !== Object.keys(entry.changes)[Object.keys(entry.changes).length - 1] && (
                            <Separator className="mt-4" />
                          )}
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              </div>
            </div>
          ))}
          </div>

          {/* Show More/Less Button */}
          {hasMoreToShow && (
            <div className="flex justify-center mt-12">
              <Button
                variant="outline"
                onClick={() => setShowAll(!showAll)}
                className="transition-all duration-300 ease-in-out hover:scale-105"
              >
                {showAll ? 'Show Less' : 'Show More'}
              </Button>
            </div>
          )}
        </div>

        {/* Back to Top Button */}
        <div
          className={`fixed bottom-5 right-5 z-50 transition-all duration-300 ease-in-out ${
            showBackToTop
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
        >
          <div className="group relative">
            <Button
              onClick={scrollToTop}
              size="icon"
              className="h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
              aria-label="Back to top"
            >
              <ChevronUp className="h-5 w-5" />
            </Button>
            <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <div className="bg-popover text-popover-foreground px-2 py-1 rounded text-sm whitespace-nowrap shadow-md border">
                Back to Top
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        {/* <div className="text-center mt-16 p-8 bg-muted/30 rounded-lg">
          <p className="text-muted-foreground">
            This changelog follows the{' '}
            <a 
              href="https://keepachangelog.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Keep a Changelog
            </a>{' '}
            format and{' '}
            <a 
              href="https://semver.org/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Semantic Versioning
            </a>{' '}
            principles.
          </p>
        </div> */}
      </div>
    </div>
  )
}
