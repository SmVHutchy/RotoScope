/** Rahmen um beide Ansichten: haelt den Modus, liefert die gemeinsame Kopfzeile. */

import { useState } from 'react';
import { App } from './App';
import { FieldView } from './FieldView';
import { Header, type Mode } from './Header';

export function Shell() {
  const [mode, setMode] = useState<Mode>(
    () => (new URLSearchParams(window.location.search).get('mode') as Mode) ?? 'transition',
  );

  return (
    <main className="app app--split">
      <Header mode={mode} onMode={setMode} />
      {mode === 'transition' ? <App /> : <FieldView />}
    </main>
  );
}
