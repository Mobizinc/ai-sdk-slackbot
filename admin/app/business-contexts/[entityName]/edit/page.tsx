"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { apiClient, type BusinessContext } from "@/lib/api-client"
import { BusinessContextForm } from "@/components/BusinessContextForm"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { toast } from "sonner"
import Link from "next/link"
import { ArrowLeft, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function EditEntityPage() {
  const params = useParams()
  const router = useRouter()
  const entityName = decodeURIComponent(params.entityName as string)

  const [context, setContext] = useState<BusinessContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadEntity()
  }, [entityName])

  async function loadEntity() {
    try {
      setLoading(true)
      const all = await apiClient.getBusinessContexts()
      const found = all.find(c => c.entityName === entityName)
      setContext(found || null)
    } catch (err) {
      toast.error('Failed to load entity')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(data: any) {
    if (!context) return

    try {
      await apiClient.updateBusinessContext(context.id, data)
      toast.success('Entity updated successfully!')
      router.push(`/business-contexts/${encodeURIComponent(data.entityName)}`)
    } catch (error) {
      toast.error('Failed to update entity')
      console.error(error)
      throw error
    }
  }

  async function handleDelete() {
    if (!context) return

    try {
      setDeleting(true)
      await apiClient.deleteBusinessContext(context.id)
      toast.success('Entity deleted successfully!')
      router.push('/business-contexts')
    } catch (error) {
      toast.error('Failed to delete entity')
      console.error(error)
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  }

  if (!context) {
    return <div className="bg-red-50 border border-red-200 rounded-lg p-6">Entity not found</div>
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Link href={`/business-contexts/${encodeURIComponent(entityName)}`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" />
          Back to Entity
        </Link>

        <Button
          variant="destructive"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit {entityName}</h1>
        <BusinessContextForm
          initialData={context}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
          submitText="Save Changes"
        />
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Delete Entity"
        description={`Are you sure you want to delete "${entityName}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        loading={deleting}
      />
    </div>
  )
}
