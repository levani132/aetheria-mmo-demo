import { useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import CharacterSelect from '../components/CharacterSelect';

// Three.js depends on `window`, so the Game component must be client-only.
const Game = dynamic(() => import('../components/Game'), { ssr: false });

export default function Home() {
  const [session, setSession] = useState(null);

  return (
    <>
      <Head>
        <title>Aetheria</title>
        <meta name="description" content="A small multiplayer realm." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      {session
        ? <Game session={session} onExit={() => setSession(null)} />
        : <CharacterSelect onJoin={setSession} />}
    </>
  );
}
