import { useState } from 'react';
import { Graveyard, KitRoot, SeanceView } from '@ghost-run/ui';
import { entries } from '../sample-data';

export function GraveRow() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = entries.find((e) => e.id === openId);
  return (
    <KitRoot>
      {open === undefined ? (
        <Graveyard entries={entries} onOpenSeance={setOpenId} />
      ) : (
        <SeanceView
          entry={open}
          onBack={() => {
            setOpenId(null);
          }}
        />
      )}
    </KitRoot>
  );
}
