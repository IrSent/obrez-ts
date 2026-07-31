import { useEffect, useRef } from 'react';
import { usePlayerStore, playerActions } from '../store/playerStore';

/**
 * When the store's `proposedTime` matches the target field, blink the given element
 * and wire up a click-handler that confirms the proposal (sets the target field
 * to the proposed value and clears the proposal).
 *
 * @param targetField  'start' | 'end' — which Add-Word field this hook serves
 * @param setField     State-setter for the target field (e.g. setAddWordStart)
 * @param fieldRef     Mutable ref to the DOM element that should blink
 */
export function useProposedTimeBlink(
  targetField: 'start' | 'end',
  setField: (v: string) => void,
  fieldRef: React.RefObject<HTMLElement | null>,
): void {
  const proposedTime = usePlayerStore((s) => s.proposedTime);
  const setFieldRef = useRef(setField);
  setFieldRef.current = setField;

  useEffect(() => {
    const isActive = proposedTime?.field === targetField;
    const el = fieldRef.current;
    if (!isActive || !el) return;

    el.classList.add('proposed-time-blink');

    const onClick = () => {
      // Read fresh proposedTime from store (closure may be stale)
      const pt = usePlayerStore.getState().proposedTime;
      if (!pt || pt.field !== targetField) return;
      setFieldRef.current(pt.time.toFixed(2));
      playerActions.setProposedTime(null);
      el.classList.remove('proposed-time-blink');
    };
    el.addEventListener('click', onClick);

    return () => {
      el.removeEventListener('click', onClick);
      el.classList.remove('proposed-time-blink');
    };
  }, [proposedTime, targetField, fieldRef]);
}
