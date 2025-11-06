"use client"

import { useRouter } from "next/navigation"
import { apiClient } from "@/lib/api-client"
import { BusinessContextForm } from "@/components/BusinessContextForm"
import { toast } from "sonner"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"


export default function CreateEntityPage() {
  const router = useRouter()

  async function handleSubmit(data: any) {
    try {
      await apiClient.createBusinessContext(data)
      toast.success('Entity created successfully!')
      router.push('/business-contexts')
    } catch (error) {
      toast.error('Failed to create entity')
      console.error(error)
      throw error
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/business-contexts" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" />
          Back to Knowledge Base
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Entity</h1>
        <BusinessContextForm
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
          submitText="Create Entity"
        />
      </div>
    </div>
  )
}
