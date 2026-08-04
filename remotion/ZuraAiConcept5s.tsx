import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Easing, interpolate, interpolateColors, useCurrentFrame } from 'remotion'

const palette = {
  background: '#0d0d0f',
  surface: '#171719',
  surfaceRaised: '#202023',
  text: '#f5f2ec',
  textSoft: 'rgba(245, 242, 236, 0.64)',
  textMuted: 'rgba(245, 242, 236, 0.38)',
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  gold: '#c9a66e',
  goldSoft: 'rgba(201, 166, 110, 0.18)',
  goldFaint: 'rgba(201, 166, 110, 0.08)',
}

const font = "'Segoe UI Variable', 'Segoe UI', Inter, -apple-system, BlinkMacSystemFont, sans-serif"

const emphasized = Easing.bezier(0.16, 1, 0.3, 1)
const standard = Easing.bezier(0.22, 1, 0.36, 1)
const exit = Easing.bezier(0.4, 0, 1, 1)

const progress = (
  frame: number,
  start: number,
  end: number,
  easing: (value: number) => number = emphasized
) =>
  interpolate(frame, [start, end], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

const fadeBetween = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [1, 0], {
    easing: exit,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

const center: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  justifyContent: 'center',
}

export const ZuraAiConcept5s = () => {
  const frame = useCurrentFrame()
  const panelOpen = progress(frame, 58, 108)
  const workspaceOpen = progress(frame, 226, 270, standard)

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.background,
        color: palette.text,
        fontFamily: font,
        overflow: 'hidden',
      }}
    >
      <AmbientBackground frame={frame} panelOpen={panelOpen} />
      <DesktopContext frame={frame} panelOpen={panelOpen} />
      <CommandCenter frame={frame} panelOpen={panelOpen} workspaceOpen={workspaceOpen} />
      <LogoMorph frame={frame} />
      <FrameAccents frame={frame} />
    </AbsoluteFill>
  )
}

const AmbientBackground = ({ frame, panelOpen }: { frame: number; panelOpen: number }) => {
  const gridIn = progress(frame, 0, 30)
  const signal = progress(frame, 4, 72, standard)

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 50% 46%, rgba(201,166,110,0.09), transparent 36%), linear-gradient(180deg, #101012 0%, #0b0b0d 100%)',
        }}
      />
      <div
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '96px 96px',
          height: 1340,
          left: -160,
          opacity: gridIn * interpolate(panelOpen, [0, 1], [0.58, 0.2]),
          position: 'absolute',
          top: -120,
          translate: interpolate(frame, [0, 300], ['0px 0px', '-38px 24px']),
          width: 2240,
        }}
      />
      <div
        style={{
          background: `linear-gradient(90deg, transparent, ${palette.gold}, transparent)`,
          boxShadow: '0 0 30px rgba(201,166,110,0.32)',
          height: 1,
          left: -520,
          opacity: interpolate(signal, [0, 0.15, 0.8, 1], [0, 0.9, 0.45, 0]),
          position: 'absolute',
          top: 540,
          translate: `${interpolate(signal, [0, 1], [0, 2920])}px 0px`,
          width: 520,
        }}
      />
      <div
        style={{
          border: `1px solid ${palette.goldFaint}`,
          borderRadius: 999,
          height: interpolate(panelOpen, [0, 1], [420, 1180]),
          left: '50%',
          opacity: interpolate(panelOpen, [0, 1], [0.8, 0.1]),
          position: 'absolute',
          scale: interpolate(frame, [0, 300], [0.86, 1.2]),
          top: '50%',
          translate: '-50% -50%',
          width: interpolate(panelOpen, [0, 1], [420, 1180]),
        }}
      />
    </AbsoluteFill>
  )
}

const DesktopContext = ({ frame, panelOpen }: { frame: number; panelOpen: number }) => {
  const contextIn = progress(frame, 40, 84)
  const push = progress(frame, 62, 112)

  const windows = [
    { x: -610, y: -250, width: 720, height: 390, driftX: -180, driftY: -42 },
    { x: 280, y: -300, width: 690, height: 420, driftX: 170, driftY: -58 },
    { x: -250, y: 250, width: 820, height: 340, driftX: 40, driftY: 155 },
  ]

  return (
    <AbsoluteFill style={center}>
      {windows.map((window, index) => (
        <div
          key={`${window.x}-${window.y}`}
          style={{
            background: 'rgba(255,255,255,0.018)',
            border: '1px solid rgba(255,255,255,0.055)',
            borderRadius: 26,
            height: window.height,
            opacity:
              contextIn *
              interpolate(panelOpen, [0, 1], [0.72, 0.22]) *
              progress(frame, 34 + index * 5, 64 + index * 5),
            position: 'absolute',
            translate: `${window.x + window.driftX * push}px ${window.y + window.driftY * push}px`,
            width: window.width,
          }}
        >
          <div
            style={{
              borderBottom: '1px solid rgba(255,255,255,0.045)',
              height: 44,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 28 }}>
            {[0.78, 0.58, 0.87, 0.44].map((width, line) => (
              <div
                key={width}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 999,
                  height: line === 0 ? 16 : 10,
                  width: `${width * 100}%`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </AbsoluteFill>
  )
}

const LogoMorph = ({ frame }: { frame: number }) => {
  const logoIn = progress(frame, 4, 34)
  const wordIn = progress(frame, 18, 44)
  const morph = progress(frame, 48, 102, standard)
  const logoHandoff = fadeBetween(frame, 104, 124)
  const wordOut = fadeBetween(frame, 48, 66)
  const ringOut = fadeBetween(frame, 44, 76)

  return (
    <AbsoluteFill style={{ ...center, pointerEvents: 'none' }}>
      <div
        style={{
          height: 250,
          opacity: logoHandoff,
          position: 'relative',
          scale: interpolate(morph, [0, 1], [1, 0.13]),
          translate: `${interpolate(morph, [0, 1], [0, -614])}px ${interpolate(
            morph,
            [0, 1],
            [-38, -332]
          )}px`,
          width: 250,
          zIndex: 20,
        }}
      >
        <div
          style={{
            border: `1px solid ${palette.gold}`,
            borderRadius: 999,
            height: 330,
            left: -40,
            opacity: logoIn * ringOut * 0.38,
            position: 'absolute',
            rotate: interpolate(frame, [0, 78], ['-18deg', '18deg']),
            scale: interpolate(logoIn, [0, 1], [0.7, 1]),
            top: -40,
            width: 330,
          }}
        />
        <LogoRail
          opacity={logoIn}
          side="left"
          translate={interpolate(logoIn, [0, 1], ['-210px -20px', '0px 0px'])}
        />
        <LogoRail
          opacity={logoIn}
          side="right"
          translate={interpolate(logoIn, [0, 1], ['210px 20px', '0px 0px'])}
        />
      </div>
      <div
        style={{
          fontSize: 70,
          fontWeight: 720,
          letterSpacing: interpolate(wordIn, [0, 1], [24, 5]),
          opacity: wordIn * wordOut,
          position: 'absolute',
          top: 675,
          translate: `0px ${interpolate(wordIn, [0, 1], [28, 0])}px`,
        }}
      >
        ZURAAI
      </div>
      <div
        style={{
          background: palette.gold,
          height: 2,
          opacity: wordIn * wordOut,
          position: 'absolute',
          scale: `${interpolate(wordIn, [0, 1], [0, 1])} 1`,
          top: 768,
          width: 168,
        }}
      />
    </AbsoluteFill>
  )
}

const LogoRail = ({
  opacity,
  side,
  translate,
}: {
  opacity: number
  side: 'left' | 'right'
  translate: string
}) => (
  <div
    style={{
      background: palette.text,
      borderRadius: '32px 32px 25px 25px',
      boxShadow: '0 16px 40px rgba(0,0,0,0.30)',
      height: 206,
      left: side === 'left' ? 43 : 133,
      opacity,
      position: 'absolute',
      rotate: side === 'left' ? '2.5deg' : '-2.5deg',
      top: 22,
      translate,
      width: 74,
    }}
  />
)

const CommandCenter = ({
  frame,
  panelOpen,
  workspaceOpen,
}: {
  frame: number
  panelOpen: number
  workspaceOpen: number
}) => {
  const contentIn = progress(frame, 96, 124)
  const panelScaleX = interpolate(panelOpen, [0, 1], [0.06, 1])
  const panelScaleY = interpolate(panelOpen, [0, 1], [0.12, 1])

  return (
    <AbsoluteFill style={center}>
      <div
        style={{
          background: 'rgba(20,20,22,0.94)',
          border: `1px solid ${palette.borderStrong}`,
          borderRadius: interpolate(panelOpen, [0, 1], [44, 28]),
          boxShadow: '0 52px 160px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.08)',
          height: 720,
          opacity: progress(frame, 54, 72),
          overflow: 'hidden',
          position: 'relative',
          scale: `${panelScaleX} ${panelScaleY}`,
          translate: `0px ${interpolate(panelOpen, [0, 1], [90, 0])}px`,
          width: 1420,
          zIndex: 10,
        }}
      >
        <PanelTrace frame={frame} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            opacity: contentIn,
          }}
        >
          <CommandTopBar frame={frame} workspaceOpen={workspaceOpen} />
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <RootResults frame={frame} workspaceOpen={workspaceOpen} />
            <GitHubWorkspacePreview frame={frame} workspaceOpen={workspaceOpen} />
          </div>
          <CommandFooter frame={frame} workspaceOpen={workspaceOpen} />
        </div>
      </div>
    </AbsoluteFill>
  )
}

const PanelTrace = ({ frame }: { frame: number }) => {
  const trace = progress(frame, 80, 126, standard)

  return (
    <>
      <div
        style={{
          background: `linear-gradient(90deg, transparent, ${palette.gold}, transparent)`,
          height: 1,
          left: 0,
          opacity: fadeBetween(frame, 112, 170),
          position: 'absolute',
          scale: `${trace} 1`,
          top: 0,
          transformOrigin: 'center',
          width: '100%',
        }}
      />
      <div
        style={{
          background: palette.gold,
          boxShadow: '0 0 18px rgba(201,166,110,0.52)',
          height: 3,
          left: interpolate(trace, [0, 1], ['0%', '100%']),
          opacity: fadeBetween(frame, 118, 152),
          position: 'absolute',
          top: 0,
          translate: '-50% 0px',
          width: 110,
        }}
      />
    </>
  )
}

const CommandTopBar = ({ frame, workspaceOpen }: { frame: number; workspaceOpen: number }) => {
  const typeStart = 138
  const typedCharacters = Math.floor(
    interpolate(frame, [typeStart, 174], [0, 6], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const query = 'github'.slice(0, typedCharacters)
  const cursorVisible = Math.floor((frame - typeStart) / 12) % 2 === 0
  const shortcutOut = fadeBetween(frame, 134, 154)

  return (
    <div
      style={{
        alignItems: 'center',
        borderBottom: `1px solid ${palette.border}`,
        display: 'flex',
        gap: 20,
        height: 92,
        padding: '0 28px',
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: 10, width: 54 }}>
        <MiniLogo />
      </div>
      <div
        style={{
          alignItems: 'center',
          background: interpolateColors(
            workspaceOpen,
            [0, 1],
            [palette.surfaceRaised, palette.surface]
          ),
          border: `1px solid ${interpolateColors(
            workspaceOpen,
            [0, 1],
            [palette.border, 'rgba(255,255,255,0.06)']
          )}`,
          borderRadius: 14,
          display: 'flex',
          flex: 1,
          gap: 15,
          height: 58,
          padding: '0 16px',
          scale: interpolate(progress(frame, 102, 124), [0, 1], [0.96, 1]),
        }}
      >
        <SearchGlyph />
        <div
          style={{
            color: query ? palette.text : palette.textMuted,
            flex: 1,
            fontSize: 23,
            fontWeight: 480,
            letterSpacing: -0.3,
            opacity: fadeBetween(frame, 220, 244),
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {query || 'Search workflows, apps, windows...'}
          {query && (
            <span
              style={{
                color: palette.gold,
                opacity: cursorVisible ? 1 : 0,
              }}
            >
              |
            </span>
          )}
        </div>
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 6,
            opacity: progress(frame, 112, 132) * shortcutOut,
          }}
        >
          {['CTRL', 'SHIFT', 'SPACE'].map((key, index) => (
            <Keycap key={key} delay={index * 5} frame={frame} label={key} />
          ))}
        </div>
        <div
          style={{
            color: palette.textSoft,
            fontSize: 20,
            fontWeight: 600,
            opacity: workspaceOpen,
            position: 'absolute',
            translate: '22px 0px',
          }}
        >
          GitHub Workspace
        </div>
      </div>
    </div>
  )
}

const Keycap = ({ delay, frame, label }: { delay: number; frame: number; label: string }) => {
  const enter = progress(frame, 110 + delay, 126 + delay)

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${palette.border}`,
        borderRadius: 7,
        color: palette.textMuted,
        fontSize: 10,
        fontWeight: 760,
        letterSpacing: 0.6,
        opacity: enter,
        padding: '7px 8px',
        translate: `0px ${interpolate(enter, [0, 1], [-10, 0])}px`,
      }}
    >
      {label}
    </div>
  )
}

const RootResults = ({ frame, workspaceOpen }: { frame: number; workspaceOpen: number }) => {
  const filter = progress(frame, 174, 205, standard)
  const rootOut = fadeBetween(frame, 226, 250)
  const rows = [
    {
      icon: <CodeGlyph />,
      title: 'Visual Studio Code',
      subtitle: 'Focus application',
      y: 62,
    },
    {
      icon: <LayoutGlyph />,
      title: 'Layout',
      subtitle: 'Snap, tile, and maximize the active window',
      y: 146,
    },
    {
      icon: <GitGlyph />,
      title: 'GitHub',
      subtitle: 'Changes, history, branches, and sync',
      y: 230,
      isGitHub: true,
    },
    {
      icon: <ClipboardGlyph />,
      title: 'Ask about clipboard',
      subtitle: 'Send copied context to ZuraAI',
      y: 314,
    },
    {
      icon: <ScheduleGlyph />,
      title: 'Schedules',
      subtitle: 'Manage reminders and AI automations',
      y: 398,
    },
  ]

  return (
    <div
      style={{
        height: '100%',
        opacity: rootOut * (1 - workspaceOpen * 0.4),
        padding: '28px 34px',
        position: 'relative',
        translate: `${interpolate(workspaceOpen, [0, 1], [0, -90])}px 0px`,
      }}
    >
      <div
        style={{
          color: palette.textMuted,
          fontSize: 15,
          fontWeight: 650,
          letterSpacing: 1.5,
          opacity: fadeBetween(frame, 174, 190),
          textTransform: 'uppercase',
        }}
      >
        Suggestions
      </div>
      <div style={{ height: 478, position: 'relative' }}>
        {rows.map((row, index) => {
          const rowIn = progress(frame, 118 + index * 7, 146 + index * 7)
          const isGitHub = Boolean(row.isGitHub)
          const filteredOpacity = isGitHub ? 1 : 1 - filter
          const filteredY = isGitHub ? interpolate(filter, [0, 1], [row.y, 64]) : row.y
          const selected = isGitHub ? progress(frame, 190, 214) : 0

          return (
            <ResultRow
              frame={frame}
              icon={row.icon}
              key={row.title}
              opacity={rowIn * filteredOpacity}
              selected={selected}
              subtitle={row.subtitle}
              title={row.title}
              translate={`0px ${filteredY + interpolate(rowIn, [0, 1], [24, 0])}px`}
            />
          )
        })}
      </div>
    </div>
  )
}

const ResultRow = ({
  frame,
  icon,
  opacity,
  selected,
  subtitle,
  title,
  translate,
}: {
  frame: number
  icon: ReactNode
  opacity: number
  selected: number
  subtitle: string
  title: string
  translate: string
}) => (
  <div
    style={{
      alignItems: 'center',
      background: `linear-gradient(90deg, rgba(201,166,110,${selected * 0.18}), rgba(255,255,255,${
        selected * 0.035
      }))`,
      border: `1px solid rgba(201,166,110,${selected * 0.38})`,
      borderRadius: 15,
      display: 'grid',
      gridTemplateColumns: '54px minmax(0,1fr) auto',
      height: 70,
      left: 0,
      opacity,
      padding: '0 18px',
      position: 'absolute',
      scale: interpolate(selected, [0, 1], [1, 1.015]),
      translate,
      width: '100%',
    }}
  >
    <div
      style={{
        ...center,
        background: selected ? palette.goldSoft : 'rgba(255,255,255,0.04)',
        borderRadius: 11,
        color: selected ? palette.gold : palette.textSoft,
        height: 42,
        width: 42,
      }}
    >
      {icon}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 21, fontWeight: 650, letterSpacing: -0.2 }}>{title}</div>
      <div style={{ color: palette.textMuted, fontSize: 14, marginTop: 4 }}>{subtitle}</div>
    </div>
    <div
      style={{
        alignItems: 'center',
        color: selected ? palette.gold : palette.textMuted,
        display: 'flex',
        fontSize: 14,
        fontWeight: 650,
        gap: 10,
        opacity: selected,
      }}
    >
      Open
      <div
        style={{
          ...center,
          border: `1px solid ${palette.border}`,
          borderRadius: 7,
          height: 28,
          scale: interpolate(progress(frame, 202, 218), [0, 1], [0.84, 1]),
          width: 34,
        }}
      >
        ↵
      </div>
    </div>
  </div>
)

const GitHubWorkspacePreview = ({
  frame,
  workspaceOpen,
}: {
  frame: number
  workspaceOpen: number
}) => {
  const detailsIn = progress(frame, 244, 276)

  return (
    <div
      style={{
        height: '100%',
        opacity: workspaceOpen,
        padding: '30px 34px 22px',
        position: 'absolute',
        top: 0,
        translate: `${interpolate(workspaceOpen, [0, 1], [140, 0])}px 0px`,
        width: '100%',
      }}
    >
      <div style={{ alignItems: 'flex-start', display: 'flex', gap: 24 }}>
        <div
          style={{
            background: palette.surfaceRaised,
            border: `1px solid ${palette.border}`,
            borderRadius: 20,
            height: 420,
            padding: 26,
            width: 420,
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: 15 }}>
            <div
              style={{
                ...center,
                background: palette.goldSoft,
                borderRadius: 13,
                color: palette.gold,
                height: 52,
                width: 52,
              }}
            >
              <GitGlyph size={28} />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>ZuraAI</div>
              <div style={{ color: palette.textMuted, fontSize: 15, marginTop: 5 }}>main</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
            <StatusPill color={palette.gold} label="3 changes" />
            <StatusPill color="#6fa980" label="Up to date" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 32 }}>
            {['ZuraAiConcept5s.tsx', 'Root.tsx', 'motion tokens'].map((label, index) => (
              <div
                key={label}
                style={{
                  alignItems: 'center',
                  color: palette.textSoft,
                  display: 'flex',
                  fontSize: 16,
                  gap: 13,
                  opacity: progress(frame, 248 + index * 6, 270 + index * 6),
                  translate: `${interpolate(
                    progress(frame, 248 + index * 6, 270 + index * 6),
                    [0, 1],
                    [-22, 0]
                  )}px 0px`,
                }}
              >
                <span style={{ color: index === 2 ? '#6fa980' : palette.gold, fontWeight: 700 }}>
                  {index === 2 ? 'A' : 'M'}
                </span>
                {label}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            background: '#111113',
            border: `1px solid ${palette.border}`,
            borderRadius: 20,
            flex: 1,
            height: 420,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              alignItems: 'center',
              borderBottom: `1px solid ${palette.border}`,
              display: 'flex',
              height: 58,
              justifyContent: 'space-between',
              padding: '0 22px',
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 650 }}>Changes</span>
            <span style={{ color: palette.textMuted, fontSize: 13 }}>3 files</span>
          </div>
          <div style={{ padding: '24px 26px' }}>
            {[0.84, 0.66, 0.92, 0.48, 0.74, 0.58, 0.87].map((width, index) => {
              const lineIn = progress(frame, 244 + index * 4, 270 + index * 4)
              const addition = index === 1 || index === 4
              return (
                <div
                  key={`${width}-${index}`}
                  style={{
                    alignItems: 'center',
                    display: 'flex',
                    gap: 14,
                    marginBottom: 16,
                    opacity: lineIn,
                    translate: `${interpolate(lineIn, [0, 1], [36, 0])}px 0px`,
                  }}
                >
                  <div
                    style={{
                      background: addition ? '#6fa980' : palette.gold,
                      borderRadius: 999,
                      height: 6,
                      opacity: 0.86,
                      width: 6,
                    }}
                  />
                  <div
                    style={{
                      background: addition ? 'rgba(111,169,128,0.22)' : 'rgba(201,166,110,0.16)',
                      borderRadius: 999,
                      height: 11,
                      scale: `${lineIn} 1`,
                      transformOrigin: 'left',
                      width: `${width * 100}%`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div
        style={{
          alignItems: 'center',
          color: palette.textSoft,
          display: 'flex',
          fontSize: 16,
          gap: 12,
          marginTop: 18,
          opacity: detailsIn,
        }}
      >
        <span style={{ color: palette.gold }}>●</span>
        Quick Actions keep the workflow in motion
      </div>
    </div>
  )
}

const StatusPill = ({ color, label }: { color: string; label: string }) => (
  <div
    style={{
      background: `${color}1f`,
      border: `1px solid ${color}40`,
      borderRadius: 999,
      color,
      fontSize: 13,
      fontWeight: 650,
      padding: '8px 12px',
    }}
  >
    {label}
  </div>
)

const CommandFooter = ({ frame, workspaceOpen }: { frame: number; workspaceOpen: number }) => (
  <div
    style={{
      alignItems: 'center',
      borderTop: `1px solid ${palette.border}`,
      color: palette.textMuted,
      display: 'flex',
      fontSize: 13,
      height: 56,
      justifyContent: 'space-between',
      opacity: progress(frame, 128, 152),
      padding: '0 28px',
    }}
  >
    <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
      <MiniLogo size={19} />
      ZuraAI Quick Actions
    </div>
    <div style={{ display: 'flex', gap: 22 }}>
      <span style={{ opacity: 1 - workspaceOpen }}>↑↓ Navigate</span>
      <span>{workspaceOpen ? 'Esc Back' : '↵ Open'}</span>
    </div>
  </div>
)

const FrameAccents = ({ frame }: { frame: number }) => {
  const inProgress = progress(frame, 0, 42)

  return (
    <>
      <div
        style={{
          background: palette.gold,
          bottom: 52,
          height: 2,
          left: 70,
          opacity: inProgress * 0.75,
          position: 'absolute',
          scale: `${interpolate(frame, [0, 300], [0, 1])} 1`,
          transformOrigin: 'left',
          width: 1780,
        }}
      />
      <div
        style={{
          bottom: 31,
          color: palette.textMuted,
          fontSize: 11,
          fontWeight: 650,
          left: 70,
          letterSpacing: 2.6,
          opacity: progress(frame, 16, 42),
          position: 'absolute',
        }}
      >
        FROM INTENT TO ACTION
      </div>
      <div
        style={{
          bottom: 31,
          color: palette.textMuted,
          fontSize: 11,
          fontWeight: 650,
          letterSpacing: 2.6,
          opacity: progress(frame, 16, 42),
          position: 'absolute',
          right: 70,
        }}
      >
        00:05
      </div>
    </>
  )
}

const MiniLogo = ({ size = 28 }: { size?: number }) => (
  <div style={{ height: size, position: 'relative', width: size }}>
    <div
      style={{
        background: palette.text,
        borderRadius: size * 0.17,
        height: size * 0.78,
        left: size * 0.16,
        position: 'absolute',
        top: size * 0.11,
        width: size * 0.25,
      }}
    />
    <div
      style={{
        background: palette.text,
        borderRadius: size * 0.17,
        height: size * 0.78,
        position: 'absolute',
        right: size * 0.16,
        top: size * 0.11,
        width: size * 0.25,
      }}
    />
  </div>
)

const IconFrame = ({ children, size = 22 }: { children: ReactNode; size?: number }) => (
  <svg
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    width={size}
  >
    {children}
  </svg>
)

const SearchGlyph = () => (
  <IconFrame size={24}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </IconFrame>
)

const GitGlyph = ({ size = 22 }: { size?: number }) => (
  <IconFrame size={size}>
    <circle cx="6" cy="5" r="2" />
    <circle cx="18" cy="6" r="2" />
    <circle cx="6" cy="19" r="2" />
    <path d="M6 7v10M8 8c2.5 0 3 4 6 4h2M16 6h-5" />
  </IconFrame>
)

const LayoutGlyph = () => (
  <IconFrame>
    <rect height="15" rx="2" width="18" x="3" y="4.5" />
    <path d="M12 5v14M3 10h9" />
  </IconFrame>
)

const ClipboardGlyph = () => (
  <IconFrame>
    <rect height="17" rx="2" width="14" x="5" y="4" />
    <path d="M9 4V2.5h6V4M8.5 10h7M8.5 14h5" />
  </IconFrame>
)

const ScheduleGlyph = () => (
  <IconFrame>
    <rect height="16" rx="2" width="18" x="3" y="5" />
    <path d="M7 3v4M17 3v4M3 10h18M8 14h3M14 14h2" />
  </IconFrame>
)

const CodeGlyph = () => (
  <IconFrame>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
  </IconFrame>
)
