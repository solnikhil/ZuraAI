import type { CSSProperties, ReactNode } from 'react'
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  interpolateColors,
  staticFile,
  useCurrentFrame,
} from 'remotion'

const colors = {
  bg: '#0d0d0f',
  bgRaised: '#121214',
  panel: '#18181b',
  panelRaised: '#202024',
  panelSoft: '#242429',
  text: '#f7f4ee',
  soft: 'rgba(247,244,238,0.66)',
  muted: 'rgba(247,244,238,0.38)',
  faint: 'rgba(247,244,238,0.12)',
  border: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.17)',
  gold: '#c9a66e',
  goldSoft: 'rgba(201,166,110,0.17)',
  goldFaint: 'rgba(201,166,110,0.08)',
  green: '#83b78d',
  blue: '#83a6cb',
}

const font = "'Segoe UI Variable', 'Segoe UI', Inter, -apple-system, BlinkMacSystemFont, sans-serif"
const emphasized = Easing.bezier(0.16, 1, 0.3, 1)
const standard = Easing.bezier(0.22, 1, 0.36, 1)
const exit = Easing.bezier(0.4, 0, 1, 1)

const p = (
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

const out = (frame: number, start: number, end: number) =>
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

export const ZuraAiFilm15s = () => {
  const frame = useCurrentFrame()

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        color: colors.text,
        fontFamily: font,
        overflow: 'hidden',
      }}
    >
      <Background frame={frame} />
      <OpeningTypography frame={frame} />
      <CommandCenterScene frame={frame} />
      <MainAppScene frame={frame} />
      <LayoutScene frame={frame} />
      <EndCard frame={frame} />
      <FilmEdge frame={frame} />
    </AbsoluteFill>
  )
}

const Background = ({ frame }: { frame: number }) => {
  const desktopIn = p(frame, 92, 152)
  const dimForApp = p(frame, 250, 300)
  const finish = p(frame, 758, 850)

  const windows = [
    { x: -620, y: -255, w: 700, h: 390, dx: -80, dy: -30 },
    { x: 370, y: -282, w: 650, h: 410, dx: 92, dy: -38 },
    { x: -300, y: 272, w: 850, h: 360, dx: -18, dy: 80 },
  ]

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 50% 47%, rgba(201,166,110,0.09), transparent 34%), linear-gradient(180deg,#111114 0%,#0b0b0d 100%)',
          opacity: interpolate(finish, [0, 1], [1, 0.18]),
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.024) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.024) 1px, transparent 1px)',
          backgroundSize: '96px 96px',
          opacity: interpolate(frame, [0, 50, 300, 900], [0, 0.32, 0.12, 0.04], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          translate: interpolate(frame, [0, 900], ['0px 0px', '-70px 34px']),
        }}
      />
      <AbsoluteFill style={center}>
        {windows.map((window, index) => {
          const enter = p(frame, 100 + index * 7, 142 + index * 7)
          return (
            <div
              key={window.x}
              style={{
                background: 'rgba(255,255,255,0.018)',
                border: '1px solid rgba(255,255,255,0.055)',
                borderRadius: 24,
                height: window.h,
                opacity:
                  desktopIn *
                  enter *
                  interpolate(dimForApp, [0, 1], [0.58, 0.14]) *
                  interpolate(finish, [0, 1], [1, 0]),
                overflow: 'hidden',
                position: 'absolute',
                translate: `${window.x + window.dx * desktopIn}px ${window.y + window.dy * desktopIn}px`,
                width: window.w,
              }}
            >
              <div style={{ borderBottom: `1px solid ${colors.faint}`, height: 44 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 28 }}>
                {[0.72, 0.48, 0.86, 0.62].map((width, line) => (
                  <div
                    key={`${width}-${line}`}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 999,
                      height: line === 0 ? 15 : 10,
                      width: `${width * 100}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

const OpeningTypography = ({ frame }: { frame: number }) => {
  const cursorIn = p(frame, 0, 14)
  const introIn = p(frame, 12, 36)
  const nameIn = p(frame, 30, 66, standard)
  const titleMorph = p(frame, 68, 94, standard)
  const titleOut = out(frame, 70, 94)
  const logoIn = p(frame, 78, 104)
  const panelOpen = p(frame, 104, 158, standard)
  const logoDock = p(frame, 172, 206, standard)
  const finalOut = out(frame, 208, 226)

  return (
    <AbsoluteFill style={{ ...center, pointerEvents: 'none', zIndex: 20 }}>
      <div
        style={{
          background: colors.gold,
          boxShadow: '0 0 22px rgba(201,166,110,0.34)',
          height: 76,
          opacity: cursorIn * titleOut,
          position: 'absolute',
          scale: `1 ${interpolate(cursorIn, [0, 1], [0, 1])}`,
          width: 2,
        }}
      />
      <div
        style={{
          color: colors.soft,
          fontSize: 18,
          fontWeight: 650,
          letterSpacing: interpolate(introIn, [0, 1], [18, 9]),
          opacity: introIn * titleOut,
          position: 'absolute',
          textTransform: 'uppercase',
          top: 370,
          translate: `0px ${interpolate(introIn, [0, 1], [18, 0])}px`,
        }}
      >
        Introducing
      </div>
      <div
        style={{
          clipPath: `inset(${interpolate(nameIn, [0, 1], [100, 0])}% 0 0 0)`,
          fontSize: 112,
          fontWeight: 720,
          letterSpacing: interpolate(nameIn, [0, 1], [30, 4]),
          lineHeight: 1,
          opacity: nameIn * titleOut,
          position: 'absolute',
          scale: interpolate(titleMorph, [0, 1], [1, 0.2]),
          top: 432,
          translate: `0px ${interpolate(nameIn, [0, 1], [46, 0]) + interpolate(
            titleMorph,
            [0, 1],
            [0, 52]
          )}px`,
        }}
      >
        ZURA AI
      </div>
      <div
        style={{
          height: 210,
          opacity: logoIn * finalOut,
          position: 'absolute',
          scale: interpolate(logoIn, [0, 1], [0.72, 1]) * interpolate(logoDock, [0, 1], [1, 0.19]),
          translate: `${interpolate(logoDock, [0, 1], [0, -626])}px ${interpolate(
            logoDock,
            [0, 1],
            [0, -350]
          )}px`,
          width: 210,
        }}
      >
        <div
          style={{
            border: `1px solid ${colors.gold}`,
            borderRadius: 999,
            height: interpolate(panelOpen, [0, 1], [268, 1040]),
            left: '50%',
            opacity: interpolate(panelOpen, [0, 0.7, 1], [0.5, 0.18, 0]),
            position: 'absolute',
            top: '50%',
            translate: '-50% -50%',
            width: interpolate(panelOpen, [0, 1], [268, 1640]),
          }}
        />
        <Img
          src={staticFile('icon-mark.svg')}
          style={{
            filter: 'drop-shadow(0 18px 38px rgba(0,0,0,0.34))',
            height: '100%',
            width: '100%',
          }}
        />
      </div>
    </AbsoluteFill>
  )
}

const CommandCenterScene = ({ frame }: { frame: number }) => {
  const open = p(frame, 106, 158, standard)
  const contentIn = p(frame, 150, 184)
  const queryPhase = p(frame, 190, 238, standard)
  const selected = p(frame, 226, 252)
  const sceneOut = out(frame, 254, 292)
  const typedCount = Math.floor(
    interpolate(frame, [190, 226], [0, 13], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const query = 'ask clipboard'.slice(0, typedCount)
  const rows = [
    ['GitHub', 'Changes, branches, and sync', <GitIcon />],
    ['Layout', 'Arrange the active workspace', <LayoutIcon />],
    ['Ask about clipboard', 'Send copied context to ZuraAI', <ClipboardIcon />],
    ['Schedules', 'Reminders and AI automations', <ScheduleIcon />],
  ]

  return (
    <AbsoluteFill style={{ ...center, zIndex: 10 }}>
      <div
        style={{
          background: 'rgba(22,22,25,0.96)',
          border: `1px solid ${colors.borderStrong}`,
          borderRadius: interpolate(open, [0, 1], [52, 28]),
          boxShadow: '0 54px 170px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.07)',
          height: interpolate(open, [0, 1], [140, 720]),
          opacity: p(frame, 100, 118) * sceneOut,
          overflow: 'hidden',
          position: 'relative',
          width: interpolate(open, [0, 1], [150, 1420]),
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            opacity: contentIn,
          }}
        >
          <div
            style={{
              alignItems: 'center',
              borderBottom: `1px solid ${colors.border}`,
              display: 'flex',
              gap: 18,
              height: 94,
              padding: '0 30px',
            }}
          >
            <MiniLogo size={34} />
            <div
              style={{
                alignItems: 'center',
                background: colors.panelRaised,
                border: `1px solid ${colors.border}`,
                borderRadius: 15,
                display: 'flex',
                flex: 1,
                gap: 14,
                height: 60,
                padding: '0 18px',
              }}
            >
              <SearchIcon />
              <span
                style={{
                  color: query ? colors.text : colors.muted,
                  flex: 1,
                  fontSize: 23,
                  fontWeight: 490,
                }}
              >
                {query || 'Search workflows, apps, windows...'}
                {query && (
                  <span style={{ color: colors.gold, opacity: Math.floor(frame / 10) % 2 ? 1 : 0 }}>
                    |
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', gap: 6, opacity: 1 - queryPhase }}>
                {['CTRL', 'SHIFT', 'SPACE'].map((key) => (
                  <Key key={key}>{key}</Key>
                ))}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, padding: '24px 34px', position: 'relative' }}>
            <div
              style={{
                color: colors.muted,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 1.8,
                textTransform: 'uppercase',
              }}
            >
              {queryPhase > 0.35 ? 'Best Matches' : 'Suggestions'}
            </div>
            <div style={{ marginTop: 16, position: 'relative' }}>
              {rows.map(([title, subtitle, icon], index) => {
                const isAsk = title === 'Ask about clipboard'
                const rowIn = p(frame, 158 + index * 6, 182 + index * 6)
                const filtered = isAsk ? 1 : 1 - queryPhase
                const targetY = isAsk ? interpolate(queryPhase, [0, 1], [index * 92, 0]) : index * 92
                return (
                  <CommandRow
                    icon={icon}
                    key={title as string}
                    opacity={rowIn * filtered}
                    selected={isAsk ? selected : 0}
                    subtitle={subtitle as string}
                    title={title as string}
                    y={targetY}
                  />
                )
              })}
            </div>
          </div>
          <div
            style={{
              alignItems: 'center',
              borderTop: `1px solid ${colors.border}`,
              color: colors.muted,
              display: 'flex',
              fontSize: 14,
              height: 58,
              justifyContent: 'space-between',
              padding: '0 30px',
            }}
          >
            <span>Quick Actions</span>
            <span style={{ color: selected ? colors.gold : colors.muted }}>↵ Open</span>
          </div>
        </div>
      </div>
      <div
        style={{
          bottom: 94,
          color: colors.muted,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 3.2,
          opacity: p(frame, 154, 180) * out(frame, 244, 264),
          position: 'absolute',
        }}
      >
        COMMAND CENTER
      </div>
    </AbsoluteFill>
  )
}

const CommandRow = ({
  icon,
  opacity,
  selected,
  subtitle,
  title,
  y,
}: {
  icon: ReactNode
  opacity: number
  selected: number
  subtitle: string
  title: string
  y: number
}) => (
  <div
    style={{
      alignItems: 'center',
      background: interpolateColors(
        selected,
        [0, 1],
        ['rgba(255,255,255,0.015)', 'rgba(201,166,110,0.15)']
      ),
      border: `1px solid rgba(201,166,110,${selected * 0.38})`,
      borderRadius: 15,
      display: 'grid',
      gridTemplateColumns: '54px minmax(0,1fr) auto',
      height: 76,
      opacity,
      padding: '0 18px',
      position: 'absolute',
      scale: interpolate(selected, [0, 1], [1, 1.012]),
      translate: `0px ${y}px`,
      width: '100%',
    }}
  >
    <div
      style={{
        ...center,
        background: selected ? colors.goldSoft : 'rgba(255,255,255,0.04)',
        borderRadius: 11,
        color: selected ? colors.gold : colors.soft,
        height: 42,
        width: 42,
      }}
    >
      {icon}
    </div>
    <div>
      <div style={{ fontSize: 21, fontWeight: 650 }}>{title}</div>
      <div style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>{subtitle}</div>
    </div>
    <div style={{ color: colors.gold, fontSize: 14, fontWeight: 650, opacity: selected }}>
      Open&nbsp;&nbsp; ↵
    </div>
  </div>
)

const MainAppScene = ({ frame }: { frame: number }) => {
  const sceneIn = p(frame, 258, 300, standard)
  const sceneOut = out(frame, 744, 792)
  const timelineIn = p(frame, 322, 356)
  const approvalIn = p(frame, 470, 496)
  const approvalOut = out(frame, 538, 558)
  const resultIn = p(frame, 548, 610)
  const appScale = interpolate(sceneIn, [0, 1], [0.88, 1]) * interpolate(1 - sceneOut, [0, 1], [1, 0.94])

  return (
    <AbsoluteFill style={{ ...center, zIndex: 12 }}>
      <div
        style={{
          background: colors.bgRaised,
          border: `1px solid ${colors.borderStrong}`,
          borderRadius: 28,
          boxShadow: '0 56px 180px rgba(0,0,0,0.66)',
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          height: 890,
          opacity: sceneIn * sceneOut,
          overflow: 'hidden',
          scale: appScale,
          width: 1660,
        }}
      >
        <Sidebar frame={frame} />
        <ChatWorkspace frame={frame} timelineIn={timelineIn} resultIn={resultIn} />
      </div>
      <div
        style={{
          ...center,
          background: 'rgba(9,9,11,0.66)',
          inset: 0,
          opacity: approvalIn * approvalOut * sceneOut,
          position: 'absolute',
        }}
      >
        <ApprovalDialog frame={frame} opacity={approvalIn * approvalOut} />
      </div>
    </AbsoluteFill>
  )
}

const Sidebar = ({ frame }: { frame: number }) => (
  <div
    style={{
      background: '#141416',
      borderRight: `1px solid ${colors.border}`,
      display: 'flex',
      flexDirection: 'column',
      padding: '30px 22px 24px',
    }}
  >
    <div style={{ alignItems: 'center', display: 'flex', gap: 13, padding: '0 10px' }}>
      <MiniLogo size={32} />
      <span style={{ fontSize: 22, fontWeight: 720 }}>ZuraAI</span>
    </div>
    <div
      style={{
        alignItems: 'center',
        background: colors.goldSoft,
        border: `1px solid rgba(201,166,110,0.26)`,
        borderRadius: 13,
        color: colors.gold,
        display: 'flex',
        fontSize: 16,
        fontWeight: 650,
        gap: 12,
        marginTop: 32,
        padding: '13px 15px',
      }}
    >
      <PlusIcon /> New chat
    </div>
    <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700, letterSpacing: 1.6, margin: '28px 12px 12px' }}>
      TODAY
    </div>
    {['Release review', 'Quick Actions motion', 'Product research'].map((item, index) => (
      <div
        key={item}
        style={{
          background: index === 0 ? 'rgba(255,255,255,0.045)' : 'transparent',
          borderRadius: 11,
          color: index === 0 ? colors.text : colors.soft,
          fontSize: 15,
          opacity: p(frame, 278 + index * 6, 304 + index * 6),
          padding: '12px 14px',
        }}
      >
        {item}
      </div>
    ))}
    <div style={{ flex: 1 }} />
    <div style={{ borderTop: `1px solid ${colors.border}`, color: colors.muted, fontSize: 14, padding: '18px 12px 0' }}>
      Settings
    </div>
  </div>
)

const ChatWorkspace = ({
  frame,
  timelineIn,
  resultIn,
}: {
  frame: number
  timelineIn: number
  resultIn: number
}) => {
  const promptIn = p(frame, 286, 326)
  const resultRows = [
    ['Release requirements', 'Research', <SearchIcon size={19} />, 350, 394],
    ['Validate release metadata', 'Code', <CodeIcon />, 382, 430],
    ['Read pull request', 'MCP · GitHub', <GitIcon />, 414, 460],
  ] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div
        style={{
          alignItems: 'center',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          height: 70,
          justifyContent: 'space-between',
          padding: '0 30px',
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 650 }}>Release review</div>
          <div style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>Agent workspace</div>
        </div>
        <div style={{ alignItems: 'center', color: colors.soft, display: 'flex', fontSize: 13, gap: 10 }}>
          <span style={{ background: colors.green, borderRadius: 999, height: 7, width: 7 }} />
          Agent Mode
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '34px 64px 20px' }}>
        <div
          style={{
            background: colors.panelRaised,
            border: `1px solid ${colors.border}`,
            borderRadius: '18px 18px 5px 18px',
            fontSize: 18,
            lineHeight: 1.45,
            marginLeft: 'auto',
            maxWidth: 680,
            opacity: promptIn,
            padding: '18px 22px',
            translate: `${interpolate(promptIn, [0, 1], [44, 0])}px 0px`,
          }}
        >
          Review this release context, run checks, and summarize the risks.
        </div>
        <div style={{ marginTop: 28, maxWidth: 870, opacity: timelineIn }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 13 }}>
            <MiniLogo size={30} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 650 }}>Planning the release review</div>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 3 }}>Visible agent timeline</div>
            </div>
          </div>
          <div
            style={{
              borderLeft: `1px solid ${colors.border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              margin: '18px 0 0 15px',
              paddingLeft: 26,
            }}
          >
            {resultRows.map(([title, kind, icon, start, end]) => {
              const rowIn = p(frame, start, start + 24)
              const complete = p(frame, end, end + 18)
              return (
                <div
                  key={title}
                  style={{
                    alignItems: 'center',
                    background: colors.panel,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 14,
                    display: 'grid',
                    gridTemplateColumns: '42px 1fr auto',
                    minHeight: 62,
                    opacity: rowIn,
                    padding: '9px 15px',
                    translate: `${interpolate(rowIn, [0, 1], [-28, 0])}px 0px`,
                  }}
                >
                  <div style={{ ...center, color: colors.gold }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 620 }}>{title}</div>
                    <div style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{kind}</div>
                  </div>
                  <div
                    style={{
                      color: complete ? colors.green : colors.gold,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {complete > 0.65 ? 'Completed' : 'Running'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(201,166,110,0.14), rgba(255,255,255,0.025))',
            border: `1px solid rgba(201,166,110,0.26)`,
            borderRadius: 17,
            marginTop: 20,
            maxWidth: 870,
            opacity: resultIn,
            padding: '19px 22px',
            translate: `0px ${interpolate(resultIn, [0, 1], [28, 0])}px`,
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Release brief ready</div>
            <div style={{ color: colors.green, fontSize: 13, fontWeight: 720 }}>✓ CHECKS PASSED</div>
          </div>
          <div style={{ color: colors.soft, display: 'flex', fontSize: 14, gap: 22, marginTop: 13 }}>
            <span><b style={{ color: colors.text }}>3</b> risks identified</span>
            <span><b style={{ color: colors.text }}>6</b> sources verified</span>
            <span><b style={{ color: colors.text }}>184</b> tests passed</span>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 64px 30px' }}>
        <div
          style={{
            alignItems: 'center',
            background: colors.panel,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 18,
            display: 'flex',
            height: 76,
            justifyContent: 'space-between',
            padding: '0 18px 0 22px',
          }}
        >
          <span style={{ color: colors.muted, fontSize: 16 }}>Ask ZuraAI anything...</span>
          <div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
            <span
              style={{
                background: colors.goldSoft,
                border: `1px solid rgba(201,166,110,0.28)`,
                borderRadius: 999,
                color: colors.gold,
                fontSize: 12,
                fontWeight: 720,
                padding: '8px 11px',
              }}
            >
              AGENT MODE
            </span>
            <div style={{ ...center, background: colors.gold, borderRadius: 11, color: '#16130e', height: 42, width: 42 }}>↑</div>
          </div>
        </div>
      </div>
      <div
        style={{
          bottom: 28,
          color: colors.muted,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 3,
          opacity: p(frame, 304, 340) * out(frame, 416, 444),
          position: 'absolute',
          right: 96,
        }}
      >
        AGENT MODE
      </div>
    </div>
  )
}

const ApprovalDialog = ({ frame, opacity }: { frame: number; opacity: number }) => {
  const click = p(frame, 522, 538)

  return (
    <div
      style={{
        background: colors.panel,
        border: `1px solid ${colors.borderStrong}`,
        borderRadius: 22,
        boxShadow: '0 44px 130px rgba(0,0,0,0.68)',
        opacity,
        padding: 26,
        scale: interpolate(opacity, [0, 1], [0.92, 1]),
        width: 700,
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: 14 }}>
        <div style={{ ...center, background: colors.goldSoft, borderRadius: 12, color: colors.gold, height: 44, width: 44 }}>
          <CodeIcon />
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Approve code execution</div>
          <div style={{ color: colors.muted, fontSize: 14, marginTop: 5 }}>JavaScript · validate release metadata</div>
        </div>
      </div>
      <div
        style={{
          background: '#101012',
          border: `1px solid ${colors.border}`,
          borderRadius: 14,
          color: colors.soft,
          fontFamily: "'SFMono-Regular', Consolas, monospace",
          fontSize: 15,
          lineHeight: 1.7,
          marginTop: 22,
          padding: '17px 19px',
        }}
      >
        <span style={{ color: colors.blue }}>await</span> runReleaseChecks&#40;&#41;
      </div>
      <div style={{ color: colors.muted, fontSize: 13, marginTop: 18 }}>
        This action runs only after your approval.
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
        <DialogButton>Reject</DialogButton>
        <DialogButton active pressed={click}>Approve</DialogButton>
      </div>
    </div>
  )
}

const DialogButton = ({
  active = false,
  children,
  pressed = 0,
}: {
  active?: boolean
  children: ReactNode
  pressed?: number
}) => (
  <div
    style={{
      background: active ? colors.gold : colors.panelRaised,
      border: `1px solid ${active ? colors.gold : colors.border}`,
      borderRadius: 11,
      color: active ? '#17130e' : colors.soft,
      fontSize: 14,
      fontWeight: 700,
      padding: '11px 19px',
      scale: interpolate(pressed, [0, 0.5, 1], [1, 0.94, 1]),
    }}
  >
    {children}
  </div>
)

const LayoutScene = ({ frame }: { frame: number }) => {
  const enter = p(frame, 678, 712)
  const choose = p(frame, 710, 738)
  const exitScene = out(frame, 750, 790)
  const snap = p(frame, 724, 770, standard)

  return (
    <AbsoluteFill style={{ ...center, pointerEvents: 'none', zIndex: 24 }}>
      <div
        style={{
          background: 'rgba(21,21,24,0.97)',
          border: `1px solid ${colors.borderStrong}`,
          borderRadius: 20,
          boxShadow: '0 34px 110px rgba(0,0,0,0.60)',
          opacity: enter * exitScene,
          overflow: 'hidden',
          scale: interpolate(enter, [0, 1], [0.88, 1]),
          translate: '0px 250px',
          width: 780,
        }}
      >
        <div style={{ alignItems: 'center', borderBottom: `1px solid ${colors.border}`, display: 'flex', gap: 13, height: 70, padding: '0 22px' }}>
          <SearchIcon size={21} />
          <span style={{ color: colors.soft, fontSize: 19 }}>Layout</span>
        </div>
        <div style={{ padding: 14 }}>
          <div
            style={{
              alignItems: 'center',
              background: interpolateColors(choose, [0, 1], ['transparent', colors.goldSoft]),
              border: `1px solid rgba(201,166,110,${choose * 0.36})`,
              borderRadius: 13,
              display: 'flex',
              fontSize: 18,
              fontWeight: 650,
              justifyContent: 'space-between',
              padding: '15px 17px',
            }}
          >
            <span>Snap right</span>
            <span style={{ color: colors.gold }}>↵</span>
          </div>
        </div>
      </div>
      <div
        style={{
          background: colors.gold,
          boxShadow: '0 0 28px rgba(201,166,110,0.44)',
          height: interpolate(snap, [0, 1], [0, 1080]),
          left: '50%',
          opacity: snap * out(frame, 770, 794),
          position: 'absolute',
          top: '50%',
          translate: '-50% -50%',
          width: 2,
        }}
      />
    </AbsoluteFill>
  )
}

const EndCard = ({ frame }: { frame: number }) => {
  const inProgress = p(frame, 768, 832, standard)
  const wordIn = p(frame, 820, 858)
  const taglineIn = p(frame, 846, 880)

  return (
    <AbsoluteFill
      style={{
        ...center,
        background: interpolateColors(inProgress, [0, 1], ['rgba(13,13,15,0)', colors.bg]),
        opacity: inProgress,
        zIndex: 30,
      }}
    >
      <div style={{ ...center, flexDirection: 'column' }}>
        <div
          style={{
            height: 128,
            opacity: inProgress,
            scale: interpolate(inProgress, [0, 1], [0.72, 1]),
            width: 128,
          }}
        >
          <Img src={staticFile('icon-mark.svg')} style={{ height: '100%', width: '100%' }} />
        </div>
        <div
          style={{
            fontSize: 76,
            fontWeight: 720,
            letterSpacing: interpolate(wordIn, [0, 1], [18, 1]),
            marginTop: 28,
            opacity: wordIn,
            translate: `0px ${interpolate(wordIn, [0, 1], [20, 0])}px`,
          }}
        >
          ZuraAI
        </div>
        <div
          style={{
            color: colors.gold,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: 7,
            marginTop: 22,
            opacity: taglineIn,
            textTransform: 'uppercase',
          }}
        >
          From intent to action
        </div>
      </div>
    </AbsoluteFill>
  )
}

const FilmEdge = ({ frame }: { frame: number }) => (
  <>
    <div
      style={{
        background: colors.gold,
        bottom: 36,
        height: 1,
        left: 72,
        opacity: p(frame, 120, 170) * out(frame, 768, 810) * 0.62,
        position: 'absolute',
        scale: `${interpolate(frame, [120, 760], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })} 1`,
        transformOrigin: 'left',
        width: 1776,
        zIndex: 40,
      }}
    />
    <div
      style={{
        bottom: 17,
        color: colors.muted,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 2.4,
        opacity: p(frame, 140, 180) * out(frame, 768, 800),
        position: 'absolute',
        right: 72,
        zIndex: 40,
      }}
    >
      00:15
    </div>
  </>
)

const MiniLogo = ({ size = 28 }: { size?: number }) => (
  <Img src={staticFile('icon-mark.svg')} style={{ height: size, width: size }} />
)

const Key = ({ children }: { children: ReactNode }) => (
  <span
    style={{
      background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${colors.border}`,
      borderRadius: 7,
      color: colors.muted,
      fontSize: 10,
      fontWeight: 760,
      letterSpacing: 0.5,
      padding: '7px 8px',
    }}
  >
    {children}
  </span>
)

const Icon = ({ children, size = 22 }: { children: ReactNode; size?: number }) => (
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

const SearchIcon = ({ size = 23 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Icon>
)

const ClipboardIcon = () => (
  <Icon>
    <rect height="17" rx="2" width="14" x="5" y="4" />
    <path d="M9 4V2.5h6V4M8.5 10h7M8.5 14h5" />
  </Icon>
)

const LayoutIcon = () => (
  <Icon>
    <rect height="15" rx="2" width="18" x="3" y="4.5" />
    <path d="M12 5v14M3 10h9" />
  </Icon>
)

const ScheduleIcon = () => (
  <Icon>
    <rect height="16" rx="2" width="18" x="3" y="5" />
    <path d="M7 3v4M17 3v4M3 10h18M8 14h3M14 14h2" />
  </Icon>
)

const GitIcon = () => (
  <Icon>
    <circle cx="6" cy="5" r="2" />
    <circle cx="18" cy="6" r="2" />
    <circle cx="6" cy="19" r="2" />
    <path d="M6 7v10M8 8c2.5 0 3 4 6 4h2M16 6h-5" />
  </Icon>
)

const CodeIcon = () => (
  <Icon>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
  </Icon>
)

const PlusIcon = () => (
  <Icon size={18}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)
