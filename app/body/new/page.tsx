import BodyScanForm from "@/components/BodyScanForm";

export default function NewBodyScan() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Add InBody scan</h1>
      <BodyScanForm />
    </div>
  );
}
