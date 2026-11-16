'use client';
import dynamic from 'next/dynamic';
const Game = dynamic(() => import('../App'), { ssr: false, loading: () => <p>Loading Simplayz…</p> });
export default function Page() { return <Game />; }
