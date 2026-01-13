// Script temporal para encontrar un usuario
import User from '../models/User';
import { sequelize } from '../config/database';

const findUser = async () => {
  try {
    await sequelize.authenticate();
    
    const email = process.argv[2] || 'aebief@gmail.com';
    const user = await User.findOne({
      where: { email },
      attributes: ['id', 'email', 'username', 'currency']
    });

    if (user) {
      console.log('Usuario encontrado:');
      console.log(JSON.stringify(user.toJSON(), null, 2));
    } else {
      console.log('Usuario no encontrado');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

findUser();
