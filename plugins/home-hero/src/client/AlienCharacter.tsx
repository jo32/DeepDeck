import SpiderOrbThree from './SpiderOrbThree.tsx'

/** The same interactive character used by the composer, sized by its host. */
export function AlienCharacter({ active = false }: { readonly active?: boolean }) {
  return <SpiderOrbThree
    appearance="alien"
    expression={active ? 'doing' : 'auto'}
    expressionEpoch={0}
    repositionSignal={0}
    actionMode={active ? 'doing' : 'face'}
    interactive
  />
}
