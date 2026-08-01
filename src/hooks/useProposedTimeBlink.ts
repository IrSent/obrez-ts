import { useEffect, useRef } from 'react';
import { usePlayerStore, playerActions } from '../store/playerStore';

/**
 * When the store's `proposedTime` is set, blink the given Add-Word field
 * and wire up a click-handler that confirms the proposal (sets the field
 * to the proposed value and clears the proposal).
 *
 * Both 'start' and 'end' fields blink simultaneously when proposedTime is active.
 * Clicking either field sets the proposed time into that field.
 *
 * @param _targetField  'start' | 'end' — which Add-Word field this hook serves (unused, kept for API)
 * @param setField     State-setter for the target field (e.g. setAddWordStart)
 * @param fieldRef     Mutable ref to the DOM element that should blink
 */
export function useProposedTimeBlink(
  _targetField: 'start' | 'end',
  setField: (v: string) => void,
  fieldRef: React.RefObject<HTMLElement | null>,
): void {
  const proposedTime = usePlayerStore((s) => s.proposedTime);
  const setFieldRef = useRef(setField);
  setFieldRef.current = setField;

  useEffect(() => {
    if (!proposedTime) return;
    const el = fieldRef.current;
    if (!el) return;

    el.classList.add('proposed-time-blink');

    const onClick = () => {
      // Read fresh proposedTime from store (closure may be stale)
      const pt = usePlayerStore.getState().proposedTime;
      if (!pt) return;
      setFieldRef.current(pt.toFixed(2));
      playerActions.setProposedTime(null);
      el.classList.remove('proposed-time-blink');
    };
    el.addEventListener('click', onClick);

    return () => {
      el.removeEventListener('click', onClick);
      el.classList.remove('proposed-time-blink');
    };
  }, [proposedTime, _targetField, fieldRef]);
}
