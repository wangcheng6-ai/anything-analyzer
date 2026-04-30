import type { WebContents } from 'electron'
import type { InteractionEvent } from '@shared/types'

interface ReplayOptions {
  speed: number       // Playback speed multiplier (1.0 = original)
  skipMoves: boolean  // Whether to skip hover/move events
}

/**
 * ReplayEngine — Replays recorded interaction events via CDP Input domain.
 */
export class ReplayEngine {
  private aborted = false

  async replay(
    webContents: WebContents,
    events: InteractionEvent[],
    options: ReplayOptions = { speed: 1, skipMoves: false }
  ): Promise<{ success: boolean; stepsCompleted: number; error?: string }> {
    this.aborted = false
    let completed = 0

    if (!webContents.debugger.isAttached()) {
      try {
        webContents.debugger.attach('1.3')
      } catch (err) {
        return { success: false, stepsCompleted: 0, error: `Failed to attach debugger: ${(err as Error).message}` }
      }
    }

    try {
      for (let i = 0; i < events.length; i++) {
        if (this.aborted) break
        const event = events[i]

        if (options.skipMoves && event.type === 'hover') {
          continue
        }

        await this.executeStep(webContents, event)
        completed++

        // Wait between events based on original timing
        const nextEvent = events[i + 1]
        if (nextEvent) {
          const delay = (nextEvent.timestamp - event.timestamp) / options.speed
          await this.wait(Math.min(Math.max(delay, 10), 3000))
        }
      }
    } catch (err) {
      return { success: false, stepsCompleted: completed, error: (err as Error).message }
    }

    return { success: !this.aborted, stepsCompleted: completed }
  }

  abort(): void {
    this.aborted = true
  }

  /** Execute a single browser action (for MCP execute_browser_action tool) */
  async executeAction(
    webContents: WebContents,
    action: { type: string; selector?: string; text?: string; url?: string; x?: number; y?: number; scrollDelta?: number }
  ): Promise<{ success: boolean; error?: string }> {
    if (!webContents.debugger.isAttached()) {
      try {
        webContents.debugger.attach('1.3')
      } catch (err) {
        return { success: false, error: `Failed to attach debugger: ${(err as Error).message}` }
      }
    }

    try {
      switch (action.type) {
        case 'click': {
          if (action.selector) {
            // Resolve coordinates from selector
            const coords = await this.resolveElementCenter(webContents, action.selector)
            if (!coords) return { success: false, error: `Element not found: ${action.selector}` }
            await this.clickAt(webContents, coords.x, coords.y)
          } else if (action.x != null && action.y != null) {
            await this.clickAt(webContents, action.x, action.y)
          } else {
            return { success: false, error: 'click requires selector or x/y coordinates' }
          }
          break
        }
        case 'type': {
          if (!action.text) return { success: false, error: 'type requires text' }
          if (action.selector) {
            await webContents.debugger.sendCommand('Runtime.evaluate', {
              expression: `document.querySelector(${JSON.stringify(action.selector)})?.focus()`
            })
            await this.wait(50)
          }
          for (const char of action.text) {
            await webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
              type: 'char', text: char
            })
            await this.wait(20)
          }
          break
        }
        case 'scroll': {
          const x = action.x ?? 400
          const y = action.y ?? 300
          const delta = action.scrollDelta ?? 200
          await webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
            type: 'mouseWheel', x, y, deltaX: 0, deltaY: delta
          })
          break
        }
        case 'navigate': {
          if (!action.url) return { success: false, error: 'navigate requires url' }
          await webContents.loadURL(action.url)
          break
        }
        default:
          return { success: false, error: `Unknown action type: ${action.type}` }
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  private async executeStep(webContents: WebContents, event: InteractionEvent): Promise<void> {
    switch (event.type) {
      case 'click':
      case 'dblclick': {
        const x = event.viewport_x ?? event.x ?? 0
        const y = event.viewport_y ?? event.y ?? 0
        const clickCount = event.type === 'dblclick' ? 2 : 1
        await webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseMoved', x, y
        })
        await this.wait(30)
        await webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button: 'left', clickCount
        })
        await webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button: 'left', clickCount
        })
        break
      }
      case 'input': {
        if (event.selector && event.input_value != null) {
          await webContents.debugger.sendCommand('Runtime.evaluate', {
            expression: `document.querySelector(${JSON.stringify(event.selector)})?.focus()`
          })
          await this.wait(50)
          // Clear existing value
          await webContents.debugger.sendCommand('Runtime.evaluate', {
            expression: `{
              const el = document.querySelector(${JSON.stringify(event.selector)});
              if (el) { el.value = ''; el.dispatchEvent(new Event('input', {bubbles:true})); }
            }`
          })
          for (const char of event.input_value) {
            await webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
              type: 'char', text: char
            })
            await this.wait(15)
          }
        }
        break
      }
      case 'scroll': {
        await webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: event.viewport_x ?? 400,
          y: event.viewport_y ?? 300,
          deltaX: event.scroll_dx ?? 0,
          deltaY: event.scroll_dy ?? 0
        })
        break
      }
      case 'navigate': {
        if (event.url) {
          await webContents.loadURL(event.url)
          await this.wait(500) // wait for navigation
        }
        break
      }
      case 'hover': {
        if (event.path) {
          const points = JSON.parse(event.path) as Array<{ x: number; y: number; t: number }>
          for (const point of points) {
            if (this.aborted) break
            await webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
              type: 'mouseMoved', x: point.x, y: point.y
            })
            await this.wait(20)
          }
        }
        break
      }
    }
  }

  private async clickAt(webContents: WebContents, x: number, y: number): Promise<void> {
    await webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x, y
    })
    await this.wait(30)
    await webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', clickCount: 1
    })
    await webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', clickCount: 1
    })
  }

  private async resolveElementCenter(
    webContents: WebContents,
    selector: string
  ): Promise<{ x: number; y: number } | null> {
    const result = await webContents.debugger.sendCommand('Runtime.evaluate', {
      expression: `(function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`,
      returnByValue: true
    })
    return result?.result?.value ?? null
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.max(ms, 5)))
  }
}
