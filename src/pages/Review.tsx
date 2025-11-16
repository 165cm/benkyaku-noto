import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Play, TrendingUp } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import { getTodayReviewList } from '@/lib/review'
import type { ReviewSchedule } from '@/types'

export default function Review() {
  const navigate = useNavigate()
  const [reviewList, setReviewList] = useState<ReviewSchedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReviewList()
  }, [])

  const loadReviewList = async () => {
    setLoading(true)
    const list = await getTodayReviewList()
    setReviewList(list)
    setLoading(false)
  }

  const getDaysSinceLastStudy = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  const getPriorityColor = (score: number) => {
    if (score >= 150) return 'text-error'
    if (score >= 100) return 'text-warning'
    return 'text-gray-600'
  }

  const getPriorityLabel = (score: number) => {
    if (score >= 150) return '最優先'
    if (score >= 100) return '優先'
    return '通常'
  }

  if (loading) {
    return <div>読み込み中...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">復習リスト</h1>
          <p className="text-gray-600 mt-1">
            復習が推奨される問題を優先度順に表示しています
          </p>
        </div>
      </div>

      {reviewList.length === 0 ? (
        <div className="text-center py-12">
          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-2">復習する問題がありません</p>
          <p className="text-sm text-gray-400">
            問題を解いて学習記録を蓄積すると、復習リストが表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviewList.map((review) => {
            const daysSince = getDaysSinceLastStudy(review.lastStudiedAt)

            return (
              <Card
                key={review.problemId}
                className="flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">
                      問題 {review.problemNumber}
                    </h3>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${getPriorityColor(
                        review.priorityScore
                      )}`}
                    >
                      {getPriorityLabel(review.priorityScore)}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mb-2">
                    {review.workbookTitle}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>
                      復習回数: {review.reviewCount}回
                    </span>
                    <span>
                      平均正答率: {Math.round(review.averageScore)}%
                    </span>
                    <span>
                      最終学習: {daysSince}日前
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right mr-2">
                    <div className="flex items-center gap-1 text-sm">
                      <TrendingUp size={14} />
                      <span className={getPriorityColor(review.priorityScore)}>
                        {Math.round(review.priorityScore)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">優先度</p>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => navigate(`/study/${review.problemId}`)}
                  >
                    <Play size={16} className="mr-1" />
                    学習
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-semibold mb-2">📚 復習アルゴリズムについて</h3>
        <div className="text-sm text-gray-700 space-y-1">
          <p>
            <strong>優先度スコア</strong> = (100 - 平均正答率) × 経過日数係数
          </p>
          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
            <li>1日以内: 係数 0.5</li>
            <li>3日以内: 係数 1.0</li>
            <li>7日以内: 係数 1.5</li>
            <li>14日以内: 係数 2.0</li>
            <li>14日以上: 係数 2.5</li>
          </ul>
          <p className="mt-2 text-xs">
            ※ スコアが高いほど復習の優先度が高くなります
          </p>
        </div>
      </div>
    </div>
  )
}
