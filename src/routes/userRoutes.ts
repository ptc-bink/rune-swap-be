import { Router } from 'express';
import TaprootMultisigModal from '../model/TaprootMultisig';

const userRouter = Router();

userRouter.use(async (req, res, next) => {
    console.log('');
    console.log(`Request received for ${req.method} ${req.url}`);
    next();
})

userRouter.get('/getTaprootMusigList', async (req, res, next) => {
    try {
        const taprootMulsigList = await TaprootMultisigModal.find();

        const payload = taprootMulsigList.map((item: any) => { return item.address });

        return res.status(200).send(payload);
    } catch (error: any) {
        console.error(error);
        return res.status(500).send({
            success: false,
            message: "There is Something wrong..",
            payload: null,
        });
    }
});

export default userRouter;