import { DEFAULT_CHAIN_SLUG, MAX_DESCRIPTION, MAX_NAME } from "@/lib/chains";
import { deleteChain, updateChain } from "@/app/chains/actions";
import ConfirmDeleteButton from "@/components/crud/ConfirmDeleteButton";
import RecordEditor from "@/components/crud/RecordEditor";
import { TextAreaField, TextField } from "@/components/crud/fields";

// A chain's read view with its edit form and delete control. Used by the
// /chains cards and the chain detail page. The slug is set once at creation.
export default function ChainEditor({
  chain,
  view,
}: {
  chain: { id: string; name: string; slug: string; description: string | null };
  view: React.ReactNode;
}) {
  return (
    <RecordEditor
      action={updateChain}
      id={chain.id}
      view={view}
      actions={
        chain.slug === DEFAULT_CHAIN_SLUG ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Default chain: can&apos;t be deleted
          </span>
        ) : (
          <ConfirmDeleteButton
            action={deleteChain}
            id={chain.id}
            title="Delete this chain?"
            confirmLabel="Delete chain"
            warning="Its steps go with it, and past runs may lose their link to this chain."
          >
            {chain.name}
          </ConfirmDeleteButton>
        )
      }
    >
      <TextField label="Name" name="name" defaultValue={chain.name} required maxLength={MAX_NAME} />
      <TextAreaField
        label="Description"
        name="description"
        defaultValue={chain.description}
        maxLength={MAX_DESCRIPTION}
      />
    </RecordEditor>
  );
}
