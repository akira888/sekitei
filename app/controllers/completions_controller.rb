# 庭に名前を付けて完成させる。エディタは、完成するときの飛ばせないプレビューを掻き終えてから送る
class CompletionsController < ApplicationController
  rate_limit to: 10, within: 1.minute, only: :create, store: Rails.application.config.x.rate_limit_store

  def create
    garden = Garden.find_by!(uuid: params[:garden_uuid])
    return head :conflict if garden.completed?

    if garden.complete(params[:name])
      head :no_content
    else
      render json: { errors: garden.errors.full_messages }, status: :unprocessable_content
    end
  end
end
