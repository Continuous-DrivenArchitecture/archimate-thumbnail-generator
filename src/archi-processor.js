import { ArchiRuntime } from '@continuous-driven-architecture/archi-runtime';

export async function runArchi(modelPath, workspace, outputDirectory, { timeout = 240_000 } = {}) {
  const archi = new ArchiRuntime({
    image: 'ghcr.io/continuous-drivenarchitecture/archi-runtime:v0.1.0',
    workspace, outputDirectory, timeout
  });
  const status = await archi.check();
  if (!status.imageExists) await archi.pull();
  const result = await archi.run({ args: [
    '--loadModel', `/workspace/${modelPath.split(/[\\/]/).at(-1)}`,
    '--html.createReport', '/output/report'
  ], timeout });
  if (result.exitCode !== 0) throw Object.assign(new Error('Archi could not create the HTML report'), {
    stage: 'archi', exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr
  });
  return result;
}
