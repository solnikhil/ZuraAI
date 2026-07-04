import type { CSSProperties } from 'react'
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

const colors = {
  ink: '#f7f7f2',
  muted: '#9ba3b4',
  panel: '#10141d',
  panelSoft: '#161b26',
  line: 'rgba(255,255,255,0.12)',
  cyan: '#5ce1e6',
  blue: '#79a7ff',
  violet: '#9d7cff',
  green: '#68f3a5',
  amber: '#ffd166',
  red: '#ff6b6b',
}

const beat = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

const fadeOut = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [1, 0], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

const px = (value: number) => `${value}px`

const absoluteCenter: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  justifyContent: 'center',
}

export const ZuraAiTrailer = () => {
  const frame = useCurrentFrame()

  return (
    <AbsoluteFill style={{ backgroundColor: '#070a10', color: colors.ink }}>
      <TrailerBackground />
      <Sequence from={0} durationInFrames={76} premountFor={30}>
        <IntroScene />
      </Sequence>
      <Sequence from={58} durationInFrames={88} premountFor={30}>
        <DeskScene />
      </Sequence>
      <Sequence from={132} durationInFrames={86} premountFor={30}>
        <CapabilityScene />
      </Sequence>
      <Sequence from={204} durationInFrames={84} premountFor={30}>
        <OverlayScene />
      </Sequence>
      <Sequence from={282} durationInFrames={78} premountFor={30}>
        <FinalScene />
      </Sequence>
      <ProgressBar frame={frame} />
    </AbsoluteFill>
  )
}

const TrailerBackground = () => {
  const frame = useCurrentFrame()
  const drift = interpolate(frame, [0, 360], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const gridX = interpolate(drift, [0, 1], [-60, 40])
  const gridY = interpolate(drift, [0, 1], [-30, 50])

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 18% 18%, rgba(92,225,230,0.28), transparent 28%), radial-gradient(circle at 82% 10%, rgba(121,167,255,0.18), transparent 26%), radial-gradient(circle at 66% 82%, rgba(104,243,165,0.13), transparent 30%), linear-gradient(135deg, #05070c 0%, #0a0f19 52%, #05070c 100%)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '140%',
          left: px(gridX),
          opacity: 0.34,
          position: 'absolute',
          top: px(gridY),
          width: '140%',
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          transform: 'rotate(-8deg)',
        }}
      />
      <div
        style={{
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 999,
          height: 860,
          left: -180,
          opacity: 0.42,
          position: 'absolute',
          top: 140,
          width: 860,
        }}
      />
      <div
        style={{
          border: '1px solid rgba(92,225,230,0.18)',
          borderRadius: 999,
          height: 980,
          opacity: 0.35,
          position: 'absolute',
          right: -240,
          top: -190,
          width: 980,
        }}
      />
    </AbsoluteFill>
  )
}

const IntroScene = () => {
  const frame = useCurrentFrame()
  const titleIn = beat(frame, 2, 28)
  const subtitleIn = beat(frame, 18, 42)
  const exit = fadeOut(frame, 60, 74)

  return (
    <AbsoluteFill
      style={{
        ...absoluteCenter,
        opacity: exit,
        transform: `scale(${interpolate(titleIn, [0, 1], [0.94, 1])})`,
      }}
    >
      <LogoMark scale={interpolate(titleIn, [0, 1], [0.7, 1])} />
      <h1
        style={{
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 132,
          fontWeight: 800,
          letterSpacing: 0,
          lineHeight: 1,
          margin: '34px 0 0',
          opacity: titleIn,
        }}
      >
        ZuraAI
      </h1>
      <p
        style={{
          color: colors.muted,
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 34,
          fontWeight: 500,
          letterSpacing: 0,
          margin: '22px 0 0',
          opacity: subtitleIn,
          textAlign: 'center',
        }}
      >
        model choice, agent workflows, and local control
      </p>
    </AbsoluteFill>
  )
}

const DeskScene = () => {
  const frame = useCurrentFrame()
  const sceneIn = beat(frame, 0, 26)
  const exit = fadeOut(frame, 72, 88)

  return (
    <AbsoluteFill
      style={{
        opacity: sceneIn * exit,
        padding: '96px 120px',
      }}
    >
      <SceneHeader
        eyebrow="One desktop workspace"
        title="Chat across the model stack"
        subtitle="Bring cloud providers and local Ollama into one fast, controlled assistant."
      />
      <div style={{ display: 'flex', gap: 42, marginTop: 56 }}>
        <ChatWindow />
        <ProviderOrbit />
      </div>
    </AbsoluteFill>
  )
}

const CapabilityScene = () => {
  const frame = useCurrentFrame()
  const sceneIn = beat(frame, 0, 24)
  const exit = fadeOut(frame, 70, 86)

  return (
    <AbsoluteFill style={{ opacity: sceneIn * exit, padding: '96px 120px' }}>
      <SceneHeader
        eyebrow="Agent Workspace"
        title="Tools with visible steps and approval gates"
        subtitle="Research, MCP, code execution, memory, and desktop help stay gated and understandable."
      />
      <div
        style={{
          display: 'grid',
          gap: 22,
          gridTemplateColumns: 'repeat(3, 1fr)',
          marginTop: 58,
        }}
      >
        <FeatureCard delay={4} label="Web research" metric="cited" tone={colors.cyan} />
        <FeatureCard delay={12} label="MCP tools" metric="trusted" tone={colors.blue} />
        <FeatureCard delay={20} label="Code execution" metric="approved" tone={colors.green} />
        <FeatureCard delay={28} label="Memory" metric="local" tone={colors.violet} />
        <FeatureCard delay={36} label="Desktop actions" metric="gated" tone={colors.amber} />
        <FeatureCard delay={44} label="Run timeline" metric="visible" tone={colors.red} />
      </div>
    </AbsoluteFill>
  )
}

const OverlayScene = () => {
  const frame = useCurrentFrame()
  const sceneIn = beat(frame, 0, 24)
  const exit = fadeOut(frame, 68, 84)
  const overlayIn = beat(frame, 16, 42)

  return (
    <AbsoluteFill style={{ opacity: sceneIn * exit, padding: '92px 120px' }}>
      <SceneHeader
        eyebrow="Desktop flow"
        title="A fast overlay when context matters"
        subtitle="Summon ZuraAI without leaving the thing you are doing."
      />
      <div style={{ height: 610, marginTop: 54, position: 'relative' }}>
        <DesktopMock />
        <div
          style={{
            opacity: overlayIn,
            position: 'absolute',
            right: 76,
            top: 60,
            transform: `translateY(${interpolate(overlayIn, [0, 1], [-34, 0])}px)`,
          }}
        >
          <OverlayPanel />
        </div>
      </div>
    </AbsoluteFill>
  )
}

const FinalScene = () => {
  const frame = useCurrentFrame()
  const titleIn = beat(frame, 4, 34)
  const lineIn = beat(frame, 30, 58)

  return (
    <AbsoluteFill style={{ ...absoluteCenter, textAlign: 'center' }}>
      <div
        style={{
          opacity: titleIn,
          transform: `translateY(${interpolate(titleIn, [0, 1], [26, 0])}px)`,
        }}
      >
        <LogoMark scale={1.1} />
        <h2
          style={{
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 116,
            fontWeight: 850,
            letterSpacing: 0,
            lineHeight: 1,
            margin: '36px 0 0',
          }}
        >
          ZuraAI
        </h2>
        <p
          style={{
            color: colors.ink,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: 0,
            margin: '24px 0 0',
            opacity: lineIn,
          }}
        >
          Desktop AI for people who want control.
        </p>
      </div>
    </AbsoluteFill>
  )
}

const SceneHeader = ({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle: string
}) => {
  const frame = useCurrentFrame()
  const enter = beat(frame, 0, 24)

  return (
    <div
      style={{
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [24, 0])}px)`,
      }}
    >
      <div
        style={{
          color: colors.cyan,
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </div>
      <h2
        style={{
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 74,
          fontWeight: 820,
          letterSpacing: 0,
          lineHeight: 1.02,
          margin: '18px 0 0',
          maxWidth: 1120,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          color: colors.muted,
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 27,
          fontWeight: 500,
          letterSpacing: 0,
          lineHeight: 1.35,
          margin: '22px 0 0',
          maxWidth: 980,
        }}
      >
        {subtitle}
      </p>
    </div>
  )
}

const LogoMark = ({ scale }: { scale: number }) => {
  return (
    <div
      style={{
        ...absoluteCenter,
        background: 'linear-gradient(135deg, rgba(92,225,230,0.18), rgba(121,167,255,0.08))',
        border: `1px solid ${colors.line}`,
        borderRadius: 34,
        height: 132,
        transform: `scale(${scale})`,
        width: 132,
      }}
    >
      <Img
        src={staticFile('icon-mark.svg')}
        style={{
          height: 82,
          objectFit: 'contain',
          width: 82,
        }}
      />
    </div>
  )
}

const ChatWindow = () => {
  const frame = useCurrentFrame()
  const enter = beat(frame, 8, 34)

  return (
    <div
      style={{
        background: 'rgba(16,20,29,0.86)',
        border: `1px solid ${colors.line}`,
        borderRadius: 24,
        boxShadow: '0 34px 130px rgba(0,0,0,0.36)',
        height: 520,
        opacity: enter,
        overflow: 'hidden',
        transform: `translateX(${interpolate(enter, [0, 1], [-54, 0])}px)`,
        width: 960,
      }}
    >
      <WindowTopBar title="Agent Workspace" />
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: 464 }}>
        <div
          style={{
            background: 'rgba(255,255,255,0.035)',
            borderRight: `1px solid ${colors.line}`,
            padding: 24,
          }}
        >
          {['Pinned', 'Research', 'Build notes', 'Settings'].map((item, index) => (
            <SidebarPill key={item} active={index === 1} delay={index * 6} label={item} />
          ))}
        </div>
        <div style={{ padding: 30 }}>
          <MessageBubble
            delay={18}
            speaker="You"
            text="Compare providers for a fast research task."
          />
          <MessageBubble
            delay={34}
            speaker="ZuraAI"
            text="Planning with web search, citations, and provider-aware streaming."
            wide
          />
          <ToolRail />
        </div>
      </div>
    </div>
  )
}

const WindowTopBar = ({ title }: { title: string }) => {
  return (
    <div
      style={{
        alignItems: 'center',
        borderBottom: `1px solid ${colors.line}`,
        display: 'flex',
        height: 56,
        justifyContent: 'space-between',
        padding: '0 20px',
      }}
    >
      <div style={{ display: 'flex', gap: 9 }}>
        {[colors.red, colors.amber, colors.green].map((color) => (
          <div
            key={color}
            style={{ background: color, borderRadius: 999, height: 12, width: 12 }}
          />
        ))}
      </div>
      <div style={{ color: colors.muted, fontFamily: 'Inter, Arial, sans-serif', fontSize: 18 }}>
        {title}
      </div>
      <div style={{ width: 58 }} />
    </div>
  )
}

const SidebarPill = ({
  active,
  delay,
  label,
}: {
  active: boolean
  delay: number
  label: string
}) => {
  const frame = useCurrentFrame()
  const enter = beat(frame, 12 + delay, 32 + delay)

  return (
    <div
      style={{
        alignItems: 'center',
        background: active ? 'rgba(92,225,230,0.14)' : 'rgba(255,255,255,0.045)',
        border: `1px solid ${active ? 'rgba(92,225,230,0.28)' : 'transparent'}`,
        borderRadius: 12,
        color: active ? colors.ink : colors.muted,
        display: 'flex',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 18,
        height: 46,
        marginBottom: 12,
        opacity: enter,
        padding: '0 14px',
        transform: `translateX(${interpolate(enter, [0, 1], [-20, 0])}px)`,
      }}
    >
      {label}
    </div>
  )
}

const MessageBubble = ({
  delay,
  speaker,
  text,
  wide = false,
}: {
  delay: number
  speaker: string
  text: string
  wide?: boolean
}) => {
  const frame = useCurrentFrame()
  const enter = beat(frame, delay, delay + 20)

  return (
    <div
      style={{
        background: wide ? 'rgba(92,225,230,0.1)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${wide ? 'rgba(92,225,230,0.18)' : colors.line}`,
        borderRadius: 18,
        fontFamily: 'Inter, Arial, sans-serif',
        marginBottom: 18,
        opacity: enter,
        padding: 20,
        transform: `translateY(${interpolate(enter, [0, 1], [24, 0])}px)`,
        width: wide ? 610 : 520,
      }}
    >
      <div style={{ color: colors.cyan, fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
        {speaker}
      </div>
      <div style={{ color: colors.ink, fontSize: 22, lineHeight: 1.32 }}>{text}</div>
    </div>
  )
}

const ToolRail = () => {
  const frame = useCurrentFrame()
  const enter = beat(frame, 52, 72)

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
      }}
    >
      {['plan', 'search', 'approval', 'answer'].map((label, index) => (
        <div
          key={label}
          style={{
            background: index === 2 ? 'rgba(255,209,102,0.13)' : 'rgba(255,255,255,0.055)',
            border: `1px solid ${index === 2 ? 'rgba(255,209,102,0.26)' : colors.line}`,
            borderRadius: 999,
            color: index === 2 ? colors.amber : colors.muted,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 17,
            fontWeight: 700,
            padding: '10px 16px',
          }}
        >
          {label}
        </div>
      ))}
    </div>
  )
}

const ProviderOrbit = () => {
  const frame = useCurrentFrame()
  const enter = beat(frame, 22, 48)
  const providers = ['OpenRouter', 'Ollama', 'Perplexity', 'Groq', 'NVIDIA', 'Fireworks']

  return (
    <div
      style={{
        flex: 1,
        height: 520,
        opacity: enter,
        position: 'relative',
        transform: `translateX(${interpolate(enter, [0, 1], [54, 0])}px)`,
      }}
    >
      <div
        style={{
          ...absoluteCenter,
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 999,
          height: 460,
          left: 40,
          position: 'absolute',
          top: 30,
          width: 460,
        }}
      >
        <div
          style={{
            ...absoluteCenter,
            background: colors.panel,
            border: `1px solid ${colors.line}`,
            borderRadius: 999,
            color: colors.ink,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 27,
            fontWeight: 800,
            height: 190,
            width: 190,
          }}
        >
          one UI
        </div>
      </div>
      {providers.map((provider, index) => {
        const angle = (index / providers.length) * Math.PI * 2 + frame * 0.008
        const x = 270 + Math.cos(angle) * 230
        const y = 260 + Math.sin(angle) * 190

        return (
          <div
            key={provider}
            style={{
              background: 'rgba(16,20,29,0.9)',
              border: `1px solid ${colors.line}`,
              borderRadius: 999,
              color: colors.ink,
              fontFamily: 'Inter, Arial, sans-serif',
              fontSize: 18,
              fontWeight: 750,
              left: x - 72,
              padding: '13px 18px',
              position: 'absolute',
              textAlign: 'center',
              top: y - 24,
              width: 144,
            }}
          >
            {provider}
          </div>
        )
      })}
    </div>
  )
}

const FeatureCard = ({
  delay,
  label,
  metric,
  tone,
}: {
  delay: number
  label: string
  metric: string
  tone: string
}) => {
  const frame = useCurrentFrame()
  const enter = beat(frame, delay, delay + 24)

  return (
    <div
      style={{
        background: 'rgba(16,20,29,0.82)',
        border: `1px solid ${colors.line}`,
        borderRadius: 20,
        height: 176,
        opacity: enter,
        padding: 24,
        transform: `translateY(${interpolate(enter, [0, 1], [28, 0])}px)`,
      }}
    >
      <div
        style={{
          background: tone,
          borderRadius: 999,
          height: 14,
          marginBottom: 28,
          width: 56,
        }}
      />
      <div
        style={{
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 30,
          fontWeight: 820,
          letterSpacing: 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: colors.muted,
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 22,
          fontWeight: 650,
          marginTop: 13,
        }}
      >
        {metric}
      </div>
    </div>
  )
}

const DesktopMock = () => {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))',
        border: `1px solid ${colors.line}`,
        borderRadius: 26,
        height: 560,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <WindowTopBar title="workspace" />
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1.1fr 0.9fr', padding: 28 }}>
        <DesktopPane title="Draft" lines={[88, 72, 94, 66, 80]} />
        <DesktopPane title="Browser" lines={[70, 92, 58, 86, 64]} />
        <DesktopPane title="Files" lines={[50, 74, 68]} />
        <DesktopPane title="Notes" lines={[92, 83, 60]} />
      </div>
    </div>
  )
}

const DesktopPane = ({ title, lines }: { title: string; lines: number[] }) => {
  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${colors.line}`,
        borderRadius: 18,
        minHeight: 178,
        padding: 22,
      }}
    >
      <div
        style={{
          color: colors.ink,
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 22,
          fontWeight: 760,
          marginBottom: 20,
        }}
      >
        {title}
      </div>
      {lines.map((width, index) => (
        <div
          key={`${title}-${width}-${index}`}
          style={{
            background: 'rgba(255,255,255,0.12)',
            borderRadius: 999,
            height: 12,
            marginBottom: 13,
            width: `${width}%`,
          }}
        />
      ))}
    </div>
  )
}

const OverlayPanel = () => {
  const frame = useCurrentFrame()
  const cardIn = beat(frame, 30, 56)

  return (
    <div
      style={{
        background: 'rgba(9,13,20,0.82)',
        border: '1px solid rgba(255,255,255,0.16)',
        borderRadius: 28,
        boxShadow: '0 36px 140px rgba(0,0,0,0.45)',
        overflow: 'hidden',
        width: 690,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 18,
          height: 86,
          padding: '0 28px',
        }}
      >
        <div
          style={{
            background: colors.cyan,
            borderRadius: 999,
            height: 18,
            width: 18,
          }}
        />
        <div
          style={{
            color: colors.ink,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 26,
            fontWeight: 760,
          }}
        >
          Ask ZuraAI...
        </div>
      </div>
      <div
        style={{
          borderTop: `1px solid ${colors.line}`,
          height: interpolate(cardIn, [0, 1], [0, 248]),
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 28 }}>
          <div
            style={{
              color: colors.cyan,
              fontFamily: 'Inter, Arial, sans-serif',
              fontSize: 18,
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            contextual answer
          </div>
          <div
            style={{
              color: colors.ink,
              fontFamily: 'Inter, Arial, sans-serif',
              fontSize: 26,
              fontWeight: 650,
              lineHeight: 1.32,
            }}
          >
            Summarize the page, compare options, and send the result back to your desktop flow.
          </div>
        </div>
      </div>
    </div>
  )
}

const ProgressBar = ({ frame }: { frame: number }) => {
  const { durationInFrames } = useVideoConfig()
  const width = interpolate(frame, [0, durationInFrames - 1], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.08)',
        bottom: 36,
        height: 3,
        left: 120,
        position: 'absolute',
        right: 120,
      }}
    >
      <div
        style={{
          background: `linear-gradient(90deg, ${colors.cyan}, ${colors.blue})`,
          height: '100%',
          width: `${width}%`,
        }}
      />
    </div>
  )
}
