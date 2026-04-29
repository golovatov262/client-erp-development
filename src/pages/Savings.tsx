import { useState } from "react";
import PageHeader from "@/components/ui/page-header";
import DataTable from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SavingsCreateDialog from "./savings/SavingsCreateDialog";
import SavingApplicationsTab from "./savings/SavingApplicationsTab";
import SavingsDetailDialog from "./savings/SavingsDetailDialog";
import SavingsActionDialogs from "./savings/SavingsActionDialogs";
import SavingsEditDialog from "./savings/SavingsEditDialog";
import SavingsToolbar from "./savings/SavingsToolbar";
import savingsColumns from "./savings/savingsColumns";
import useSavingsHandlers from "./savings/useSavingsHandlers";

const Savings = () => {
  const h = useSavingsHandlers();
  const [tab, setTab] = useState<"savings" | "applications">("savings");
  const [openAppCreate, setOpenAppCreate] = useState(0);

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Сбережения"
        action={h.isAdmin || h.isManager ? (tab === "savings"
          ? { label: "Новый договор", onClick: () => h.setShowForm(true) }
          : { label: "Новая заявка", onClick: () => setOpenAppCreate(v => v + 1) }) : undefined}
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
          <SavingApplicationsTab
            members={h.members}
            orgs={h.orgs}
            canEdit={h.isAdmin || h.isManager}
            openCreate={openAppCreate}
            onConsumeOpenCreate={() => setOpenAppCreate(0)}
            onSavingCreated={() => { setTab("savings"); }}
          />
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
        orgs={h.orgs}
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