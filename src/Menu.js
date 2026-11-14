/**
 * スプレッドシートを開いたときにカスタムメニューを追加する。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('記事生成')
    .addItem('選択した行の記事を生成', 'generateSelectedRows')
    .addItem('未生成の記事をまとめて生成', 'generatePendingRows')
    .addSeparator()
    .addItem('シートを初期設定', 'setupSheet')
    .addItem('現在の設定を確認', 'showConfigStatus')
    .addToUi();
}
