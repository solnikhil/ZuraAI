import { Composition } from 'remotion'
import { ZuraAiConcept5s } from './ZuraAiConcept5s'
import { ZuraAiFilm15s } from './ZuraAiFilm15s'
import { ZuraAiTrailer } from './ZuraAiTrailer'

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="ZuraAI-Concept-5s"
        component={ZuraAiConcept5s}
        durationInFrames={300}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ZuraAI-Film-15s"
        component={ZuraAiFilm15s}
        durationInFrames={900}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ZuraAI-Trailer"
        component={ZuraAiTrailer}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  )
}
