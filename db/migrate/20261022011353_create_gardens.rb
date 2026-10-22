class CreateGardens < ActiveRecord::Migration[8.1]
  def change
    create_table :gardens do |t|
      t.string :uuid, null: false, limit: 36
      t.json :scene, null: false
      t.timestamps
    end
    add_index :gardens, :uuid, unique: true
  end
end
