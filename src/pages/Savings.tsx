import { useState } from "react";
import PageHeader from "@/components/ui/page-header";
import DataTable from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import SavingsCreateDialog from "./savings/SavingsCreateDialog";
import SavingsDetailDialog from "./savings/SavingsDetailDialog";
import SavingsActionDialogs from "./savings/SavingsActionDialogs";
import SavingsEditDialog from "./savings/SavingsEditDialog";
import SavingsToolbar from "./savings/SavingsToolbar";
import savingsColumns from "./savings/savingsColumns";
import useSavingsHandlers from "./savings/useSavingsHandlers";

const Savings = () => {
  const h = useSavingsHandlers();
  const { toast } = useToast();
  const [tab, setTab] = useState<"savings" | "applications">("savings");

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Сбережения"
        action={h.isAdmin || h.isManager ? (tab === "savings"
          ? { label: "Новый договор", onClick: () => h.setShowForm(true) }
          : { label: "Новая заявка", onClick: () => toast({ title: "Скоро", description: "Форма заявки будет добавлена после согласования полей" }) }) : undefined}
      />

      <Tabs value={tab} onValueChange={v => setTab(v as "savings" | "applications")}>
        <TabsList>
          <TabsTrigger value="savings">Сбережения</TabsTrigger>
          <TabsTrigger value="applications">Заявки</TabsTrigger>
        </TabsList>

        <TabsContent value="savings" className="space-y-4">
          <SavingsToolbar
            search={h.search}
            setSearch={h.setSearch}
            filterStatus={h.filterStatus}
            setFilterStatus={h.setFilterStatus}
            filterOrg={h.filterOrg}
            setFilterOrg={h.setFilterOrg}
            orgs={h.orgs}
            exporting={h.exporting}
            handleExportSavings={h.handleExportSavings}
            isAdmin={h.isAdmin}
            saving={h.saving}
            handleRecalcAll={h.handleRecalcAll}
          />

          <DataTable columns={savingsColumns} data={h.filtered} loading={h.loading} onRowClick={h.openDetail} />
        </TabsContent>

        <TabsContent value="applications">
          <div className="border rounded-lg p-12 text-center text-muted-foreground bg-muted/20">
            <Icon name="FileText" size={48} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium mb-1">Заявки на сбережения</p>
            <p className="text-sm">Раздел будет активирован после согласования полей карточки заявки.</p>
            <p className="text-sm mt-1">После одобрения заявки из неё автоматически создаётся договор сбережений.</p>
          </div>
        </TabsContent>
      </Tabs>

      <SavingsCreateDialog
        open={h.showForm}
        onOpenChange={h.setShowForm}
        form={h.form}
        setForm={h.setForm}
        members={h.members}
        orgs={h.orgs}
        saving={h.saving}
        onCreate={h.handleCreate}
      />

      <SavingsDetailDialog
        open={h.showDetail}
        onOpenChange={h.setShowDetail}
        detail={h.detail}
        isAdmin={h.isAdmin}
        isManager={h.isManager}
        txFilterState={h.txFilterState}
        setTxFilterState={h.setTxFilterState}
        onDeposit={() => h.setShowDeposit(true)}
        onInterest={() => h.setShowInterest(true)}
        onWithdrawal={() => h.setShowWithdrawal(true)}
        onClose={() => h.setShowClose(true)}
        onModifyTerm={() => h.setShowModifyTerm(true)}
        onBackfill={() => h.setShowBackfill(true)}
        onRateChange={() => h.setShowRateChange(true)}
        onDeleteTx={h.handleDeleteTx}
        onEditTx={h.openEditTx}
        onDeleteContract={h.handleDeleteContract}
        onDeleteAccrual={h.handleDeleteAccrual}
        onClearAccruals={h.handleClearAccruals}
        onEdit={h.openEditSaving}
      />

      <SavingsEditDialog
        open={h.showEdit}
        onOpenChange={h.setShowEdit}
        form={h.editForm}
        setForm={h.setEditForm}
        members={h.members}
        orgs={h.orgs}
        saving={h.saving}
        onSave={h.handleEditSaving}
      />

      <SavingsActionDialogs
        detail={h.detail}
        saving={h.saving}
        showDeposit={h.showDeposit}
        setShowDeposit={h.setShowDeposit}
        depositForm={h.depositForm}
        setDepositForm={h.setDepositForm}
        handleDeposit={h.handleDeposit}
        showInterest={h.showInterest}
        setShowInterest={h.setShowInterest}
        interestForm={h.interestForm}
        setInterestForm={h.setInterestForm}
        handleInterestPayout={h.handleInterestPayout}
        showWithdrawal={h.showWithdrawal}
        setShowWithdrawal={h.setShowWithdrawal}
        withdrawalForm={h.withdrawalForm}
        setWithdrawalForm={h.setWithdrawalForm}
        handleWithdrawal={h.handleWithdrawal}
        showClose={h.showClose}
        setShowClose={h.setShowClose}
        handleEarlyClose={h.handleEarlyClose}
        handleCloseByTerm={h.handleCloseByTerm}
        showModifyTerm={h.showModifyTerm}
        setShowModifyTerm={h.setShowModifyTerm}
        modifyTermForm={h.modifyTermForm}
        setModifyTermForm={h.setModifyTermForm}
        handleModifyTerm={h.handleModifyTerm}
        showBackfill={h.showBackfill}
        setShowBackfill={h.setShowBackfill}
        backfillForm={h.backfillForm}
        setBackfillForm={h.setBackfillForm}
        handleBackfill={h.handleBackfill}
        showRateChange={h.showRateChange}
        setShowRateChange={h.setShowRateChange}
        rateChangeForm={h.rateChangeForm}
        setRateChangeForm={h.setRateChangeForm}
        handleRateChange={h.handleRateChange}
        showEditTx={h.showEditTx}
        setShowEditTx={h.setShowEditTx}
        editTxForm={h.editTxForm}
        setEditTxForm={h.setEditTxForm}
        handleEditTx={h.handleEditTx}
      />
    </div>
  );
};

export default Savings;