/**
 * Downloads the pre-built standalone single-file HTML bundle via an authenticated
 * same-origin fetch + Blob URL so clicking Download never triggers an iframe
 * navigation or loses session cookies behind reverse proxies.
 */
export async function downloadStandaloneHtml(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const response = await fetch('./operation-ossuary-standalone.html', {
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Download failed (${response.status}). Please retry.`,
      };
    }

    const html = await response.text();
    // Guard against downloading a proxy auth-gate page instead of the real game bundle
    if (!html.includes('window.__STANDALONE_BUILD__')) {
      return {
        ok: false,
        error:
          'Session cookie blocked by browser. Open the preview in a new tab or allow cookies, then click Download HTML again.',
      };
    }

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'operation-ossuary-standalone.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'Could not download standalone file. Please check your connection and retry.',
    };
  }
}
