// Simula a Drive API v3 em memória, interpretando só o necessário da query.
export function createFakeDrive({ failFirst = 0 } = {}) {
  const files = [];
  let nextId = 1;
  let failuresLeft = failFirst;
  const calls = [];

  async function request({ method = 'GET', params = {}, data }) {
    calls.push({ method, params, data });
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      throw Object.assign(new Error('HTTP 503'), { status: 503, retryable: true });
    }
    if (method === 'POST') {
      const file = { id: `f${nextId++}`, name: data.name, parents: data.parents, mimeType: data.mimeType };
      files.push(file);
      return { id: file.id, name: file.name };
    }
    const parent = /'((?:[^'\\]|\\.)*)' in parents/.exec(params.q)[1];
    const name = /name = '((?:[^'\\]|\\.)*)'/.exec(params.q)[1].replace(/\\(.)/g, '$1');
    return {
      files: files
        .filter((f) => f.parents[0] === parent && f.name === name)
        .map(({ id, name: n }) => ({ id, name: n })),
    };
  }

  const childrenOf = (id) => files.filter((f) => f.parents[0] === id);
  return { request, files, calls, childrenOf };
}
