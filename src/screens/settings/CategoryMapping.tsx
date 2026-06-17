import * as React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCategoryMap } from '@/lib/hooks'
import { setCategoryMap } from '@/lib/repo'
import { SUBCATEGORIES } from '@/lib/constants'
import type { SubCategory } from '@/lib/types'

/**
 * Settings → Category mapping (§8). Lists every transaction-app sub-category
 * name seen during sync against the type we treat it as. Auto-matches seed this
 * list; the user corrects any wrong guess here and it sticks for future syncs.
 */
export function CategoryMapping() {
  const maps = useCategoryMap()

  if (maps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Category names appear here after your first sync — then you can fix any that were guessed wrong.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {maps.map((m) => (
        <div key={m.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.sourceName}</span>
          <Select value={m.type} onValueChange={(v) => setCategoryMap(m.sourceName, v as SubCategory)}>
            <SelectTrigger className="w-40 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBCATEGORIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  )
}
