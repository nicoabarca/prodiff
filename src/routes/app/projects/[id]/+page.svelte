<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";

  // The project root has no view of its own — statistics is the landing view.
  $effect(() => {
    goto(`/app/projects/${page.params.id}/statistics`, { replaceState: true });
  });
</script>
