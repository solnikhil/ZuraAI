import { useState } from 'react'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { getProviderSettingsDefinition, type ProviderId } from '../../../providers'

interface ModelToDelete {
  provider: ProviderId
  modelCode: string
  displayName: string
}

type CatalogDialogKind = NonNullable<
  ReturnType<typeof getProviderSettingsDefinition>
>['catalogDialogKind']

export function useProviderModelDialogs() {
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [modelToEdit, setModelToEdit] = useState<{
    provider: ProviderId
    model: ConfiguredModel
  } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [modelToDelete, setModelToDelete] = useState<ModelToDelete | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState<
    Partial<Record<NonNullable<CatalogDialogKind>, boolean>>
  >({})

  const openEdit = (provider: ProviderId, model: ConfiguredModel): void => {
    setModelToEdit({ provider, model })
    setEditOpen(true)
  }

  const closeEdit = (): void => {
    setEditOpen(false)
    setModelToEdit(null)
  }

  const openDelete = (model: ModelToDelete): void => {
    setModelToDelete(model)
    setDeleteOpen(true)
  }

  const closeDelete = (): void => {
    setDeleteOpen(false)
    setModelToDelete(null)
  }

  const openCatalog = (provider: ProviderId): void => {
    const kind = getProviderSettingsDefinition(provider)?.catalogDialogKind
    if (kind) setCatalogOpen((current) => ({ ...current, [kind]: true }))
  }

  const setCatalogDialogOpen = (kind: NonNullable<CatalogDialogKind>, open: boolean): void => {
    setCatalogOpen((current) => ({ ...current, [kind]: open }))
  }

  return {
    addOpen,
    setAddOpen,
    editOpen,
    setEditOpen,
    modelToEdit,
    setModelToEdit,
    openEdit,
    closeEdit,
    deleteOpen,
    setDeleteOpen,
    modelToDelete,
    openDelete,
    closeDelete,
    clearOpen,
    setClearOpen,
    catalogOpen,
    openCatalog,
    setCatalogDialogOpen,
  }
}
