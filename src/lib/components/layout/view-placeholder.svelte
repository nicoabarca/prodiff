<script lang="ts">
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import type { Component } from "svelte";

  let { icon, title, description }: { icon: Component; title: string; description: string } =
    $props();
  const Icon = $derived(icon);
</script>

<div class="flex h-full items-center justify-center">
  <Empty.Root class="border-0">
    <Empty.Header>
      <Empty.Media variant="icon"><Icon /></Empty.Media>
      <Empty.Title class="font-heading">{title}</Empty.Title>
      <Empty.Description>{description}</Empty.Description>
    </Empty.Header>
    <Empty.Content>
      <Badge variant="outline" class="tracking-widest uppercase">Coming soon</Badge>
    </Empty.Content>
  </Empty.Root>
</div>
