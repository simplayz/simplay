// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { GameProvider, useGame } from '../src/state/store';
import { createGame } from '../src/game/engine';
import { SaveFailure } from '../src/persistence/queue';
import { readRemote, writeRemote, SAVE_KEY } from '../src/persistence/client';
vi.mock('../src/persistence/client', async original => ({ ...await original<typeof import('../src/persistence/client')>(), readRemote: vi.fn(), writeRemote: vi.fn() }));
function Probe() {
  const { state, ui, newGame, hardReset }=useGame();
  return <><p data-testid="company">{state.company}</p><p>{ui.booted?'booted':'onboarding'}</p>
    <button onClick={()=>newGame('Test','Local company',0,0,'manual')}>Start test game</button>
    <button onClick={hardReset}>Reset test game</button></>;
}
const fixture=()=>createGame('Test','Server company',0,0,'manual');
afterEach(()=>{cleanup();localStorage.clear();vi.resetAllMocks();});
describe('loading, migration and retry UI',()=>{
  it('gates gameplay until read completes and does not overwrite hydrated progress',async()=>{
    let resolve!:(s:{state:ReturnType<typeof fixture>;revision:number})=>void;
    vi.mocked(readRemote).mockImplementation(()=>new Promise(r=>{resolve=r;}));
    render(<GameProvider><Probe/></GameProvider>);
    expect(screen.queryByTestId('company')).toBeNull();expect(screen.getByRole('status').textContent).toContain('Loading');
    resolve({state:fixture(),revision:3});
    await screen.findByText('Server company');expect(writeRemote).not.toHaveBeenCalled();
  });
  it('initial failure offers retry; onboarding cannot overwrite an unread save',async()=>{
    vi.mocked(readRemote).mockRejectedValueOnce(new Error()).mockResolvedValue({state:null,revision:0});
    render(<GameProvider><Probe/></GameProvider>);
    await screen.findByText('Retry loading');expect(screen.queryByTestId('company')).toBeNull();expect(writeRemote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Retry loading'));await screen.findByText('onboarding');
  });
  it('failed write retains playable state and retry saves same pending game',async()=>{
    vi.mocked(readRemote).mockResolvedValue({state:null,revision:0});
    vi.mocked(writeRemote).mockRejectedValueOnce(new SaveFailure(503)).mockResolvedValue(1);
    render(<GameProvider><Probe/></GameProvider>);await screen.findByText('onboarding');
    fireEvent.click(screen.getByText('Start test game'));await screen.findByText('Retry saving');expect(screen.getByTestId('company').textContent).toBe('Local company');
    fireEvent.click(screen.getByText('Retry saving'));await waitFor(()=>expect(writeRemote).toHaveBeenCalledTimes(2));
    expect(vi.mocked(writeRemote).mock.calls[1][0]?.company).toBe('Local company');
  });
  it('legacy/server coexist without upload until explicit choice; keys stripped immediately; delete only after successful save',async()=>{
    const legacy=JSON.parse(JSON.stringify(fixture()));legacy.company='Legacy company';legacy.execs[0].ai.apiKey='SECRET';
    localStorage.setItem(SAVE_KEY,JSON.stringify(legacy));
    vi.mocked(readRemote).mockResolvedValue({state:fixture(),revision:8});
    vi.mocked(writeRemote).mockRejectedValueOnce(new SaveFailure(503)).mockResolvedValue(9);
    render(<GameProvider><Probe/></GameProvider>);await screen.findByText('Legacy browser save found');
    expect(writeRemote).not.toHaveBeenCalled();expect(localStorage.getItem(SAVE_KEY)).not.toContain('SECRET');
    fireEvent.click(screen.getByText('Use legacy save (replace server after successful save)'));await screen.findByText('Retry saving');
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
    fireEvent.click(screen.getByText('Retry saving'));await waitFor(()=>expect(localStorage.getItem(SAVE_KEY)).toBeNull());
    expect(vi.mocked(writeRemote).mock.calls[0][1]).toBe(8);
  });
  it('reset requires confirmation and persists null (including advisor preferences)',async()=>{
    vi.mocked(readRemote).mockResolvedValue({state:fixture(),revision:4});vi.mocked(writeRemote).mockResolvedValue(5);
    vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<GameProvider><Probe/></GameProvider>);await screen.findByText('Server company');
    fireEvent.click(screen.getByText('Reset test game'));expect(writeRemote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Reset test game'));await waitFor(()=>expect(writeRemote).toHaveBeenCalledWith(null,4));
    expect(screen.getByText('onboarding')).toBeTruthy();
  });
});
