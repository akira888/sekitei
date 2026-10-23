# 作成・保存・完成の回数制限（rate_limit）の記録の置き場。
# 本番は Puma 1プロセスなのでメモリで足りる（デプロイで記録は消えるが、制限の目的には十分）。
# テスト環境の Rails.cache は数えない null_store なので、回数制限だけは専用の置き場で数える
Rails.application.config.x.rate_limit_store = ActiveSupport::Cache::MemoryStore.new
