# 庭を完成させたときの名前と時刻。完成前はどちらも NULL（名前は完成するときに付ける）
class AddCompletionToGardens < ActiveRecord::Migration[8.1]
  def change
    add_column :gardens, :name, :string, limit: 100
    add_column :gardens, :completed_at, :datetime
  end
end
