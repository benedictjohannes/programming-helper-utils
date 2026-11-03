<script context="module" lang="ts">
export const MODULE_VERSION = '1.0.0';
export function getVersion(): string {
  return MODULE_VERSION;
}
</script>

<script lang="ts">
interface ComponentProps {
  initialCount?: number;
}

let { initialCount = 0 } = $props<ComponentProps>();
let count = $state(initialCount);

function increment(): void {
  count += 1;
}
</script>

<main>
  <h1>Counter: {count}</h1>
  <button onclick={increment}>Increment</button>
</main>

<style>
main {
  text-align: center;
}
</style>
