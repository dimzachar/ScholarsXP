"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Calendar, GitBranch, Plus, Edit, Bug, Trash2, Wrench } from 'lucide-react'
import { staticChangelogData, type ChangelogEntry } from '@/lib/changelog'


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

export default function ChangelogPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
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

        {/* Timeline */}
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border"></div>
          
          {staticChangelogData.map((entry, index) => (
            <div key={entry.version} className="relative mb-12 last:mb-0">
              {/* Timeline dot */}
              <div className={`absolute left-6 w-4 h-4 rounded-full border-2 ${
                entry.isUnreleased 
                  ? 'bg-primary border-primary' 
                  : 'bg-background border-border'
              }`}></div>
              
              {/* Content */}
              <div className="ml-16">
                <Card className="shadow-lg hover:shadow-xl transition-shadow duration-200">
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-2xl">
                          {entry.isUnreleased ? 'Unreleased' : `Version ${entry.version}`}
                        </CardTitle>
                        {entry.isUnreleased && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                            In Development
                          </Badge>
                        )}
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
