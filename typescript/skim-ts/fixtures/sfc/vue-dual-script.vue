<script lang="ts">
export const DEFAULT_ROLE = 'guest';
export const sharedCount = 0;
</script>

<script setup lang="ts">
interface Props {
  id: string;
}

class FormValidator {
  constructor(public config: Props) {}
  validate(): boolean {
    return true;
  }
}

const sharedCount = 10;

function submitForm(): void {
  console.log('Submitting');
}
</script>

<template>
  <div class="user-profile">
    <span>Role: {{ DEFAULT_ROLE }}</span>
    <button @click="submitForm">Submit</button>
  </div>
</template>

<style scoped>
.user-profile {
  padding: 16px;
}
</style>

<style module>
.btn {
  color: red;
}
</style>
