import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts', 'packages/*/tests/**/*.test.tsx'],
    // Tóm tắt:
    // Các bài kiểm tra tích hợp awecode tạo các kho git tạm thời và các thư mục
    // worktree trong các khối `beforeEach`. Trên Windows, git/conhold giữ các khóa file
    // tồn tại lâu hơn một chút so với vòng đời của quy trình, gây ra lỗi EBUSY
    // khi `afterEach` cố gắng dọn dẹp.
    //
    // `fileParallelism: false` chạy tuần tự các tệp tin kiểm tra (nhưng vẫn cô lập
    // module registry của chúng — điều quan trọng vì nhiều bài kiểm tra
    // `vi.mock()` các mô-đun khác nhau). Trước đây (Vitest 3) cách viết tương đương là
    // `poolOptions.threads.singleThread: true`. Chi phí: chậm hơn ~30% so với
    // chạy song song hoàn toàn, nhưng ổn định hơn trên Windows.
    //
    // Lệnh `npx vitest run <file>` trên mỗi gói không kế thừa cấu hình gốc này
    // và vẫn chạy song song — ổn định vì một tệp thường không gây xung đột chính nó.
    fileParallelism: false,
  },
});
