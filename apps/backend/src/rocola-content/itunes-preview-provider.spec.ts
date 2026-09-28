import { vi } from 'vitest';
import { ItunesPreviewProvider } from './itunes-preview-provider.js';
import { SongPreviewLookupError } from './song-preview-provider.js';

describe('ItunesPreviewProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mapea previewUrl y sube la portada a 600x600', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            trackId: 111,
            previewUrl: 'https://example.com/preview.m4a',
            artworkUrl100: 'https://example.com/art/100x100bb.jpg',
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new ItunesPreviewProvider();

    const result = await provider.lookup([111]);

    expect(result.get(111)).toEqual({
      previewUrl: 'https://example.com/preview.m4a',
      portadaUrl: 'https://example.com/art/600x600bb.jpg',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('itunes.apple.com/lookup?id=111&country=mx'),
      expect.anything(),
    );
  });

  it('una entrada sin previewUrl queda fuera del Map', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: [{ trackId: 222, artworkUrl100: 'https://x/100x100bb.jpg' }] }),
      })),
    );
    const provider = new ItunesPreviewProvider();

    const result = await provider.lookup([222]);

    expect(result.has(222)).toBe(false);
  });

  it('respuesta no-200 lanza SongPreviewLookupError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const provider = new ItunesPreviewProvider();

    await expect(provider.lookup([1])).rejects.toThrow(SongPreviewLookupError);
  });

  it('un fetch que rechaza lanza SongPreviewLookupError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const provider = new ItunesPreviewProvider();

    await expect(provider.lookup([1])).rejects.toThrow(SongPreviewLookupError);
  });

  it('con una lista vacía no llama a fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new ItunesPreviewProvider();

    const result = await provider.lookup([]);

    expect(result.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
