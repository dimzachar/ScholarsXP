import { createServiceClient } from '@/lib/supabase-server'

export class DatabaseCache {
  private supabase: ReturnType<typeof createServiceClient> | null = null

  private getSupabaseClient() {
    if (!this.supabase) {
      // Lazy initialization to avoid environment variable issues during import
      this.supabase = createServiceClient()
    }
    return this.supabase
  }
  async get<T>(key: string): Promise<T | null> {
    try {
      const supabase = this.getSupabaseClient()
      const { data, error } = await supabase
        .from('cache_entries')
        .select('data, expires_at')
        .eq('key', key)
        .single()

      if (error || !data) return null

      // Check expiration
      if (new Date(data.expires_at) < new Date()) {
        await this.delete(key)
        return null
      }

      return data.data as T
    } catch (error) {
      console.error('Database cache get error:', error)
      return null
    }
  }

  async set<T>(key: string, data: T, ttl: number): Promise<void> {
    try {
      const supabase = this.getSupabaseClient()
      const expiresAt = new Date(Date.now() + ttl * 1000)

      await supabase
        .from('cache_entries')
        .upsert({
          key,
          data,
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
    } catch (error) {
      console.error('Database cache set error:', error)
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const supabase = this.getSupabaseClient()
      const { error } = await supabase
        .from('cache_entries')
        .delete()
        .eq('key', key)

      return !error
    } catch (error) {
      console.error('Database cache delete error:', error)
      return false
    }
  }

  async clear(): Promise<void> {
    try {
      const supabase = this.getSupabaseClient()
      await supabase
        .from('cache_entries')
        .delete()
        .neq('key', '') // Delete all entries
    } catch (error) {
      console.error('Database cache clear error:', error)
    }
  }
}
