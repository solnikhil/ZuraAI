import { forwardRef } from 'react'
import type { Icon, IconProps, IconWeight } from '@phosphor-icons/react'

import { WarningCircleIcon as WarningCircleBase } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { WarningDiamondIcon as WarningDiamondBase } from '@phosphor-icons/react/dist/csr/WarningDiamond'
import { ArrowLeftIcon as ArrowLeftBase } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { ChartBarIcon as ChartBarBase } from '@phosphor-icons/react/dist/csr/ChartBar'
import { ChartLineUpIcon as ChartLineUpBase } from '@phosphor-icons/react/dist/csr/ChartLineUp'
import { CubeIcon as CubeBase } from '@phosphor-icons/react/dist/csr/Cube'
import { BrainIcon as BrainBase } from '@phosphor-icons/react/dist/csr/Brain'
import { PlugsConnectedIcon as PlugsConnectedBase } from '@phosphor-icons/react/dist/csr/PlugsConnected'
import { CalendarIcon as CalendarBase } from '@phosphor-icons/react/dist/csr/Calendar'
import { CheckCircleIcon as CheckCircleBase } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { CheckSquareIcon as CheckSquareBase } from '@phosphor-icons/react/dist/csr/CheckSquare'
import { CheckIcon as CheckBase } from '@phosphor-icons/react/dist/csr/Check'
import { CaretDownIcon as CaretDownBase } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretLeftIcon as CaretLeftBase } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { CaretRightIcon as CaretRightBase } from '@phosphor-icons/react/dist/csr/CaretRight'
import { CaretUpIcon as CaretUpBase } from '@phosphor-icons/react/dist/csr/CaretUp'
import { QuestionIcon as QuestionBase } from '@phosphor-icons/react/dist/csr/Question'
import { CircleIcon as CircleBase } from '@phosphor-icons/react/dist/csr/Circle'
import { ClipboardIcon as ClipboardBase } from '@phosphor-icons/react/dist/csr/Clipboard'
import { ClockCounterClockwiseIcon as ClockCounterClockwiseBase } from '@phosphor-icons/react/dist/csr/ClockCounterClockwise'
import { ClockIcon as ClockBase } from '@phosphor-icons/react/dist/csr/Clock'
import { CloudIcon as CloudBase } from '@phosphor-icons/react/dist/csr/Cloud'
import { CodeBlockIcon as CodeBlockBase } from '@phosphor-icons/react/dist/csr/CodeBlock'
import { CodeIcon as CodeBase } from '@phosphor-icons/react/dist/csr/Code'
import { CopyIcon as CopyBase } from '@phosphor-icons/react/dist/csr/Copy'
import { CornersOutIcon as CornersOutBase } from '@phosphor-icons/react/dist/csr/CornersOut'
import { CpuIcon as CpuBase } from '@phosphor-icons/react/dist/csr/Cpu'
import { DatabaseIcon as DatabaseBase } from '@phosphor-icons/react/dist/csr/Database'
import { DotsThreeIcon as DotsThreeBase } from '@phosphor-icons/react/dist/csr/DotsThree'
import { DotsThreeVerticalIcon as DotsThreeVerticalBase } from '@phosphor-icons/react/dist/csr/DotsThreeVertical'
import { DownloadIcon as DownloadBase } from '@phosphor-icons/react/dist/csr/Download'
import { ArrowClockwiseIcon as ArrowClockwiseBase } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { ArrowCounterClockwiseIcon as ArrowCounterClockwiseBase } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { ArrowBendDownLeftIcon as ArrowBendDownLeftBase } from '@phosphor-icons/react/dist/csr/ArrowBendDownLeft'
import { NotePencilIcon as NotePencilBase } from '@phosphor-icons/react/dist/csr/NotePencil'
import { PencilLineIcon as PencilLineBase } from '@phosphor-icons/react/dist/csr/PencilLine'
import { ArrowSquareOutIcon as ArrowSquareOutBase } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { EyeSlashIcon as EyeSlashBase } from '@phosphor-icons/react/dist/csr/EyeSlash'
import { EyeIcon as EyeBase } from '@phosphor-icons/react/dist/csr/Eye'
import { FileArchiveIcon as FileArchiveBase } from '@phosphor-icons/react/dist/csr/FileArchive'
import { FileAudioIcon as FileAudioBase } from '@phosphor-icons/react/dist/csr/FileAudio'
import { FileCodeIcon as FileCodeBase } from '@phosphor-icons/react/dist/csr/FileCode'
import { FileArrowDownIcon as FileArrowDownBase } from '@phosphor-icons/react/dist/csr/FileArrowDown'
import { FileImageIcon as FileImageBase } from '@phosphor-icons/react/dist/csr/FileImage'
import { FileMagnifyingGlassIcon as FileMagnifyingGlassBase } from '@phosphor-icons/react/dist/csr/FileMagnifyingGlass'
import { FileTextIcon as FileTextBase } from '@phosphor-icons/react/dist/csr/FileText'
import { FileVideoIcon as FileVideoBase } from '@phosphor-icons/react/dist/csr/FileVideo'
import { FileXlsIcon as FileXlsBase } from '@phosphor-icons/react/dist/csr/FileXls'
import { FileIcon as FileBase } from '@phosphor-icons/react/dist/csr/File'
import { FlaskIcon as FlaskBase } from '@phosphor-icons/react/dist/csr/Flask'
import { FolderOpenIcon as FolderOpenBase } from '@phosphor-icons/react/dist/csr/FolderOpen'
import { FolderIcon as FolderBase } from '@phosphor-icons/react/dist/csr/Folder'
import { GhostIcon as GhostBase } from '@phosphor-icons/react/dist/csr/Ghost'
import { GlobeIcon as GlobeBase } from '@phosphor-icons/react/dist/csr/Globe'
import { HardDriveIcon as HardDriveBase } from '@phosphor-icons/react/dist/csr/HardDrive'
import { HouseIcon as HouseBase } from '@phosphor-icons/react/dist/csr/House'
import { ImageSquareIcon as ImageSquareBase } from '@phosphor-icons/react/dist/csr/ImageSquare'
import { ImageIcon as ImageBase } from '@phosphor-icons/react/dist/csr/Image'
import { InfoIcon as InfoBase } from '@phosphor-icons/react/dist/csr/Info'
import { KeyIcon as KeyBase } from '@phosphor-icons/react/dist/csr/Key'
import { LightningIcon as LightningBase } from '@phosphor-icons/react/dist/csr/Lightning'
import { LinkIcon as LinkBase } from '@phosphor-icons/react/dist/csr/Link'
import { ListIcon as ListBase } from '@phosphor-icons/react/dist/csr/List'
import { LockIcon as LockBase } from '@phosphor-icons/react/dist/csr/Lock'
import { SpinnerGapIcon as SpinnerGapBase } from '@phosphor-icons/react/dist/csr/SpinnerGap'
import { CircleNotchIcon as CircleNotchBase } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { ChatCenteredTextIcon as ChatCenteredTextBase } from '@phosphor-icons/react/dist/csr/ChatCenteredText'
import { ChatCircleTextIcon as ChatCircleTextBase } from '@phosphor-icons/react/dist/csr/ChatCircleText'
import { PlusIcon as PlusBase } from '@phosphor-icons/react/dist/csr/Plus'
import { PaperclipIcon as PaperclipBase } from '@phosphor-icons/react/dist/csr/Paperclip'
import { PaperPlaneTiltIcon as PaperPlaneTiltBase } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt'
import { PaintBrushIcon as PaintBrushBase } from '@phosphor-icons/react/dist/csr/PaintBrush'
import { CommandIcon as CommandBase } from '@phosphor-icons/react/dist/csr/Command'
import { SidebarSimpleIcon as SidebarSimpleBase } from '@phosphor-icons/react/dist/csr/SidebarSimple'
import { LayoutIcon as LayoutBase } from '@phosphor-icons/react/dist/csr/Layout'
import { PushPinIcon as PushPinBase } from '@phosphor-icons/react/dist/csr/PushPin'
import { PlayIcon as PlayBase } from '@phosphor-icons/react/dist/csr/Play'
import { BellSimpleIcon as BellSimpleBase } from '@phosphor-icons/react/dist/csr/BellSimple'
import { ScissorsIcon as ScissorsBase } from '@phosphor-icons/react/dist/csr/Scissors'
import { MagnifyingGlassIcon as MagnifyingGlassBase } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { WrenchIcon as WrenchBase } from '@phosphor-icons/react/dist/csr/Wrench'
import { HardDrivesIcon as HardDrivesBase } from '@phosphor-icons/react/dist/csr/HardDrives'
import { ShieldCheckIcon as ShieldCheckBase } from '@phosphor-icons/react/dist/csr/ShieldCheck'
import { ShieldIcon as ShieldBase } from '@phosphor-icons/react/dist/csr/Shield'
import { SparkleIcon as SparkleBase } from '@phosphor-icons/react/dist/csr/Sparkle'
import { SquareIcon as SquareBase } from '@phosphor-icons/react/dist/csr/Square'
import { StarIcon as StarBase } from '@phosphor-icons/react/dist/csr/Star'
import { GearSixIcon as GearSixBase } from '@phosphor-icons/react/dist/csr/GearSix'
import { TrendUpIcon as TrendUpBase } from '@phosphor-icons/react/dist/csr/TrendUp'
import { TrashIcon as TrashBase } from '@phosphor-icons/react/dist/csr/Trash'
import { VideoIcon as VideoBase } from '@phosphor-icons/react/dist/csr/Video'
import { XCircleIcon as XCircleBase } from '@phosphor-icons/react/dist/csr/XCircle'
import { XIcon as XBase } from '@phosphor-icons/react/dist/csr/X'

function withDefaultWeight(
  Component: Icon,
  defaultWeight: IconWeight = 'regular',
  displayName?: string
): Icon {
  const normalizedDefaultWeight: IconWeight =
    defaultWeight === 'duotone' ? 'regular' : defaultWeight

  const Wrapped = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <Component ref={ref} {...props} weight={props.weight ?? normalizedDefaultWeight} />
  ))

  Wrapped.displayName = displayName ?? Component.displayName ?? 'PremiumIcon'
  return Wrapped
}

export const AlertCircle = withDefaultWeight(WarningCircleBase, 'duotone', 'AlertCircle')
export const AlertTriangle = withDefaultWeight(WarningDiamondBase, 'duotone', 'AlertTriangle')
export const ArrowLeft = withDefaultWeight(ArrowLeftBase, 'duotone', 'ArrowLeft')
export const BarChart = withDefaultWeight(ChartBarBase, 'duotone', 'BarChart')
export const Bell = withDefaultWeight(BellSimpleBase, 'duotone', 'Bell')
export const Box = withDefaultWeight(CubeBase, 'duotone', 'Box')
export const Brain = withDefaultWeight(BrainBase, 'duotone', 'Brain')
export const Cable = withDefaultWeight(PlugsConnectedBase, 'duotone', 'Cable')
export const Calendar = withDefaultWeight(CalendarBase, 'duotone', 'Calendar')
export const ChartNoAxesCombined = withDefaultWeight(ChartLineUpBase, 'duotone', 'ChartNoAxesCombined')
export const Check = withDefaultWeight(CheckBase, 'duotone', 'Check')
export const CheckCircle = withDefaultWeight(CheckCircleBase, 'duotone', 'CheckCircle')
export const CheckCircle2 = withDefaultWeight(CheckCircleBase, 'duotone', 'CheckCircle2')
export const CheckIcon = Check
export const CheckSquare = withDefaultWeight(CheckSquareBase, 'duotone', 'CheckSquare')
export const ChevronDown = withDefaultWeight(CaretDownBase, 'duotone', 'ChevronDown')
export const ChevronLeft = withDefaultWeight(CaretLeftBase, 'duotone', 'ChevronLeft')
export const ChevronRight = withDefaultWeight(CaretRightBase, 'duotone', 'ChevronRight')
export const ChevronRightIcon = ChevronRight
export const ChevronUp = withDefaultWeight(CaretUpBase, 'duotone', 'ChevronUp')
export const CircleCheckIcon = withDefaultWeight(CheckCircleBase, 'duotone', 'CircleCheckIcon')
export const CircleHelp = withDefaultWeight(QuestionBase, 'duotone', 'CircleHelp')
export const CircleIcon = withDefaultWeight(CircleBase, 'duotone', 'CircleIcon')
export const Clipboard = withDefaultWeight(ClipboardBase, 'duotone', 'Clipboard')
export const Clock = withDefaultWeight(ClockBase, 'duotone', 'Clock')
export const Cloud = withDefaultWeight(CloudBase, 'duotone', 'Cloud')
export const Code = withDefaultWeight(CodeBase, 'duotone', 'Code')
export const Code2 = withDefaultWeight(CodeBlockBase, 'duotone', 'Code2')
export const Command = withDefaultWeight(CommandBase, 'duotone', 'Command')
export const Copy = withDefaultWeight(CopyBase, 'duotone', 'Copy')
export const CornerDownLeft = withDefaultWeight(ArrowBendDownLeftBase, 'duotone', 'CornerDownLeft')
export const Cpu = withDefaultWeight(CpuBase, 'duotone', 'Cpu')
export const Database = withDefaultWeight(DatabaseBase, 'duotone', 'Database')
export const Download = withDefaultWeight(DownloadBase, 'duotone', 'Download')
export const Edit2 = withDefaultWeight(NotePencilBase, 'duotone', 'Edit2')
export const Ellipsis = withDefaultWeight(DotsThreeBase, 'duotone', 'Ellipsis')
export const ExternalLink = withDefaultWeight(ArrowSquareOutBase, 'duotone', 'ExternalLink')
export const Eye = withDefaultWeight(EyeBase, 'duotone', 'Eye')
export const EyeOff = withDefaultWeight(EyeSlashBase, 'duotone', 'EyeOff')
export const File = withDefaultWeight(FileBase, 'duotone', 'File')
export const FileArchive = withDefaultWeight(FileArchiveBase, 'duotone', 'FileArchive')
export const FileAudio = withDefaultWeight(FileAudioBase, 'duotone', 'FileAudio')
export const FileCode2 = withDefaultWeight(FileCodeBase, 'duotone', 'FileCode2')
export const FileCog = withDefaultWeight(FileMagnifyingGlassBase, 'duotone', 'FileCog')
export const FileDown = withDefaultWeight(FileArrowDownBase, 'duotone', 'FileDown')
export const FileEdit = withDefaultWeight(NotePencilBase, 'duotone', 'FileEdit')
export const FileImage = withDefaultWeight(FileImageBase, 'duotone', 'FileImage')
export const FileJson = withDefaultWeight(FileCodeBase, 'duotone', 'FileJson')
export const FileKey = withDefaultWeight(FileMagnifyingGlassBase, 'duotone', 'FileKey')
export const FileSpreadsheet = withDefaultWeight(FileXlsBase, 'duotone', 'FileSpreadsheet')
export const FileTerminal = withDefaultWeight(CodeBlockBase, 'duotone', 'FileTerminal')
export const FileText = withDefaultWeight(FileTextBase, 'duotone', 'FileText')
export const FileType = withDefaultWeight(FileTextBase, 'duotone', 'FileType')
export const FileVideo = withDefaultWeight(FileVideoBase, 'duotone', 'FileVideo')
export const FlaskConical = withDefaultWeight(FlaskBase, 'duotone', 'FlaskConical')
export const Folder = withDefaultWeight(FolderBase, 'duotone', 'Folder')
export const FolderOpen = withDefaultWeight(FolderOpenBase, 'duotone', 'FolderOpen')
export const Ghost = withDefaultWeight(GhostBase, 'duotone', 'Ghost')
export const Globe = withDefaultWeight(GlobeBase, 'duotone', 'Globe')
export const HardDrive = withDefaultWeight(HardDriveBase, 'duotone', 'HardDrive')
export const Home = withDefaultWeight(HouseBase, 'duotone', 'Home')
export const Image = withDefaultWeight(ImageBase, 'duotone', 'Image')
export const ImagePlus = withDefaultWeight(ImageSquareBase, 'duotone', 'ImagePlus')
export const Info = withDefaultWeight(InfoBase, 'duotone', 'Info')
export const InfoIcon = Info
export const KeyRound = withDefaultWeight(KeyBase, 'duotone', 'KeyRound')
export const LayoutDashboard = withDefaultWeight(LayoutBase, 'duotone', 'LayoutDashboard')
export const List = withDefaultWeight(ListBase, 'duotone', 'List')
export const Link2 = withDefaultWeight(LinkBase, 'duotone', 'Link2')
export const Loader2 = withDefaultWeight(SpinnerGapBase, 'duotone', 'Loader2')
export const Loader2Icon = Loader2
export const LoaderCircle = withDefaultWeight(CircleNotchBase, 'duotone', 'LoaderCircle')
export const Lock = withDefaultWeight(LockBase, 'duotone', 'Lock')
export const Maximize2 = withDefaultWeight(CornersOutBase, 'duotone', 'Maximize2')
export const MessageCircle = withDefaultWeight(ChatCircleTextBase, 'duotone', 'MessageCircle')
export const MessageSquare = withDefaultWeight(ChatCenteredTextBase, 'duotone', 'MessageSquare')
export const MoreHorizontal = withDefaultWeight(DotsThreeBase, 'duotone', 'MoreHorizontal')
export const MoreVertical = withDefaultWeight(DotsThreeVerticalBase, 'duotone', 'MoreVertical')
export const OctagonXIcon = withDefaultWeight(XCircleBase, 'duotone', 'OctagonXIcon')
export const Paintbrush = withDefaultWeight(PaintBrushBase, 'duotone', 'Paintbrush')
export const PanelLeft = withDefaultWeight(SidebarSimpleBase, 'duotone', 'PanelLeft')
export const Paperclip = withDefaultWeight(PaperclipBase, 'duotone', 'Paperclip')
export const PencilLine = withDefaultWeight(PencilLineBase, 'duotone', 'PencilLine')
export const Pin = withDefaultWeight(PushPinBase, 'duotone', 'Pin')
export const Play = withDefaultWeight(PlayBase, 'fill', 'Play')
export const Plus = withDefaultWeight(PlusBase, 'duotone', 'Plus')
export const RefreshCcw = withDefaultWeight(ArrowClockwiseBase, 'duotone', 'RefreshCcw')
export const RotateCcw = withDefaultWeight(ArrowCounterClockwiseBase, 'duotone', 'RotateCcw')
export const RotateCw = withDefaultWeight(ArrowClockwiseBase, 'duotone', 'RotateCw')
export const Scissors = withDefaultWeight(ScissorsBase, 'duotone', 'Scissors')
export const Search = withDefaultWeight(MagnifyingGlassBase, 'duotone', 'Search')
export const SearchIcon = Search
export const Send = withDefaultWeight(PaperPlaneTiltBase, 'duotone', 'Send')
export const SendHorizonal = withDefaultWeight(PaperPlaneTiltBase, 'duotone', 'SendHorizonal')
export const Server = withDefaultWeight(HardDrivesBase, 'duotone', 'Server')
export const Settings = withDefaultWeight(GearSixBase, 'duotone', 'Settings')
export const Shield = withDefaultWeight(ShieldBase, 'duotone', 'Shield')
export const ShieldCheck = withDefaultWeight(ShieldCheckBase, 'duotone', 'ShieldCheck')
export const Sparkles = withDefaultWeight(SparkleBase, 'duotone', 'Sparkles')
export const Square = withDefaultWeight(SquareBase, 'duotone', 'Square')
export const Star = withDefaultWeight(StarBase, 'duotone', 'Star')
export const TimerReset = withDefaultWeight(ClockCounterClockwiseBase, 'duotone', 'TimerReset')
export const Trash2 = withDefaultWeight(TrashBase, 'duotone', 'Trash2')
export const TrendingUp = withDefaultWeight(TrendUpBase, 'duotone', 'TrendingUp')
export const TriangleAlert = withDefaultWeight(WarningDiamondBase, 'duotone', 'TriangleAlert')
export const TriangleAlertIcon = TriangleAlert
export const Video = withDefaultWeight(VideoBase, 'duotone', 'Video')
export const Wrench = withDefaultWeight(WrenchBase, 'duotone', 'Wrench')
export const X = withDefaultWeight(XBase, 'duotone', 'X')
export const XCircle = withDefaultWeight(XCircleBase, 'duotone', 'XCircle')
export const XIcon = X
export const Zap = withDefaultWeight(LightningBase, 'duotone', 'Zap')
