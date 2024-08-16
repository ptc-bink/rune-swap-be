import useRouter from './routes/userRoutes';
import express from 'express';
import cors from 'cors';

const app = express();

app.use(express.json());
app.use(cors())
app.use('/api/users', useRouter);

export default app;

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
