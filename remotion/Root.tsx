import { Composition } from 'remotion'
import { ZuraAiTrailer } from './ZuraAiTrailer'

export const RemotionRoot = () => {
  return (
    <Composition
      id="ZuraAI-Trailer"
      component={ZuraAiTrailer}
      durationInFrames={360}
      fps={30}
      width={1920}
      height={1080}
    />
  )
}
